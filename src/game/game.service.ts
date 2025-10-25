import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuestionService } from '../question/question.service';
import { PlayerService } from '../player/player.service';
import { GAME_STAGE, Game, GameDocument } from 'src/game/game.schema';
import { QuestionDocument } from 'src/question/question.schema';
import { GameTimerService } from './game-timer.service';
import { TelegramService } from '../telegram/telegram.service';
import { QuestionHistory, QuestionHistoryDocument } from 'src/question/question-history.schema';
import { QUESTION_TYPE } from 'src/question/question-type';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  constructor(
    @InjectModel(Game.name) private gameModel: Model<GameDocument>,
    private questionService: QuestionService,
    private gameTimerService: GameTimerService,
    private telegramService: TelegramService,
    @InjectModel(QuestionHistory.name) private questionHistoryModel: Model<QuestionHistoryDocument>,
  ) { }

  async getGame(chatId: number, messageId: number | undefined): Promise<Game | null> {

    const game = await this.gameModel
      .findOne({ telegramChatId: chatId, telegramMessageThreadId: messageId, isDeleted: false })
      .populate('question')
      .populate('guesser')
      .exec();

    return game || null;
  }


  async startNewGame(chatId: number, telegramMessageThreadId: number | undefined, type: QUESTION_TYPE): Promise<Game | null> {
    const question = await this.questionService.getRandomQuestion(type) as QuestionDocument;

    if (!question) {
      return null;
    }

    await this.questionService.markAsAsked(question._id as string);

    const newGame = await this.gameModel.findOneAndUpdate(
      {
        telegramChatId: chatId,
        telegramMessageThreadId: telegramMessageThreadId
      },
      {
        telegramChatId: chatId,
        telegramMessageThreadId: telegramMessageThreadId,
        question: question._id,
        stage: GAME_STAGE.CLUE_0,
        guesser: null,
        isDeleted: false,
        lastClueAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();

    // Start the timer for this game
    await this.gameTimerService.startTimer(chatId, telegramMessageThreadId, question.type, GAME_STAGE.CLUE_0);

    return this.gameModel.findById(newGame._id).populate('question').exec();
  }

  async advanceStage(telegramChatId: number, telegramMessageThreadId: number, newStage: GAME_STAGE): Promise<Game> {
    const updatedGame = await this.gameModel.findOneAndUpdate(
      {
        telegramChatId: telegramChatId,
        telegramMessageThreadId: telegramMessageThreadId,
        isDeleted: false,
      },
      { $set: { stage: newStage } },
      { new: true }
    ).exec();

    if (!updatedGame) {
      throw new NotFoundException(`Game not found or already ended for chat ${telegramChatId} message ${telegramMessageThreadId}`);
    }

    return updatedGame;
  }

  async checkAnswer(game: Game, givenAnswer: string, telegramChatId: number, telegramMessageThreadId: number | undefined): Promise<boolean> {
    if (!game) throw new NotFoundException(`No active game found for chat ${telegramChatId} message ${telegramMessageThreadId}`);

    const correctAnswer = (game.question as any).answer as string;
    if (!correctAnswer) return false;

    const normalize = (input: string) => {
      let s = input.trim().toLowerCase();
      s = s.replace(/^["'“”«»〞⹂]+|["'“”«»〞⹂]+$/g, '');
      s = s.replace(/[.!?]+$/g, '');
      s = s.replace(/ё/gi, 'е');
      return s.trim();
    };

    const nGiven = normalize(givenAnswer);
    const nCorrect = normalize(correctAnswer);
    return nGiven === nCorrect;
  }

  // TODO consider timing as well, logarithmic decay?
  public getScoreFromStage(difficulty: number = 1, stage: GAME_STAGE, wrongAnswers: number): number {
    let score = difficulty;

    switch (stage) {
      case GAME_STAGE.CLUE_0:
        score = difficulty; // +1
        break;
      case GAME_STAGE.CLUE_1:
        score = Math.max(0.2, difficulty / 2); // +0.5
        break;
      case GAME_STAGE.CLUE_2:
        score = Math.max(0.1, difficulty / 4); // +0.25
        break;
    }

    const scoreReduction = wrongAnswers * difficulty / 10;
    const finalScore = Math.max(0.01, score - scoreReduction);

    return parseFloat(finalScore.toFixed(2));
  }

  async endCurrentGame(telegramChatId: number, telegramMessageThreadId: number | undefined, questionId: string, score: number, playerId: string | null): Promise<void> {

    await this.gameTimerService.stopTimer(telegramChatId, telegramMessageThreadId);

    // removing ongoing game from the list
    await this.gameModel.deleteOne(
      { telegramChatId: telegramChatId, telegramMessageThreadId: telegramMessageThreadId }
    ).exec();

    await this.questionService.saveHistoryQuestion(telegramChatId, telegramMessageThreadId, questionId, score, playerId);
  }


  public async getTotalGames(): Promise<number> {
    return this.gameModel.countDocuments({ isDeleted: false }).exec();
  }

  public async advanceGame(chatId: number, telegramMessageThreadId: number | undefined, newStage: GAME_STAGE): Promise<QuestionDocument | null> {
    try {
      const game = await this.gameModel
        .findOne({
          telegramChatId: chatId,
          telegramMessageThreadId: telegramMessageThreadId,
          isDeleted: false
        })
        .populate('question')
        .exec();

      if (!game) {
        this.logger.log(`Game ${chatId}_${telegramMessageThreadId} not found, may have been ended already`);
        return null;
      }

      const question = game.question as QuestionDocument;
      const clue = this.questionService.generateClue(question, newStage);

      await this.gameModel.updateOne(
        { telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId },
        {
          $set: {
            stage: newStage,
            clue,
            lastClueAt: new Date()
          }
        }
      );

      this.logger.log(`Advancing game ${chatId}_${telegramMessageThreadId} to ${newStage}`);

      const questionMessage = this.telegramService.renderClue(clue);
      await this.telegramService.sendMessage(chatId, telegramMessageThreadId, questionMessage);
      return question;

    } catch (error) {
      this.logger.error(`Error advancing game ${chatId}_${telegramMessageThreadId}:`, error);
      return null;
    }
  }

  public async revealAnswer(chatId: number, telegramMessageThreadId: number | undefined, question: QuestionDocument): Promise<void> {
    const game = await this.gameModel
      .findOne({ telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId, isDeleted: false })
      .populate('question')
      .exec();
    if (!game) {
      this.logger.log(`Game ${chatId}_${telegramMessageThreadId} not found for revealing`);
      return;
    }

    this.logger.log(`Revealed answer for game ${chatId}_${telegramMessageThreadId}`);
    await this.telegramService.revealAnswer(chatId, telegramMessageThreadId, question as QuestionDocument);
  }
}