import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuestionService } from '../question/question.service';
import { PlayerService } from '../player/player.service';
import { GAME_STAGE, Game, GameDocument } from 'src/game/game.schema';
import { QuestionDocument } from 'src/question/question.schema';
import { GameTimerService } from './game-timer.service';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    @InjectModel(Game.name) private gameModel: Model<GameDocument>,
    private questionService: QuestionService,
    private playerService: PlayerService,
    private gameTimerService: GameTimerService,
  ) { }

  async getGame(chatId: number, messageId: number | undefined): Promise<Game | null> {
    const game = await this.gameModel
      .findOne({ telegramChatId: chatId, telegramMessageThreadId: messageId, isDeleted: false })
      .populate('question')
      .populate('guesser')
      .exec();

    return game || null;
  }

  async startNewGame(chatId: number, telegramMessageThreadId: number | undefined): Promise<Game | null> {
    const question = await this.questionService.getRandomQuestion() as QuestionDocument;

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

  async checkAnswer(telegramChatId: number, telegramMessageThreadId: number | undefined, answer: string, telegramUserId?: number, username?: string): Promise<boolean> {
    // TODO remove duplicated game fetching
    const game = await this.gameModel.findOne({ telegramChatId: telegramChatId, isDeleted: false }).populate('question').exec();
    if (!game) throw new NotFoundException(`No active game found for chat ${telegramChatId} message ${telegramMessageThreadId}`);

    const correctAnswer = (game.question as any).answer as string;
    if (!correctAnswer) return false;

    const normalizedGiven = answer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();

    const isCorrect = normalizedCorrect.includes(normalizedGiven) || normalizedGiven.includes(normalizedCorrect) || normalizedGiven === normalizedCorrect;

    if (isCorrect) {
      // Stop the timer as game is won
      await this.gameTimerService.stopTimer(telegramChatId, telegramMessageThreadId);

      if (telegramUserId) {
        const player = await this.playerService.findOrCreatePlayer(telegramUserId, username);
        await this.playerService.recordPlayerAnswer((game.question as any)._id as string, (player as any)._id as string, 1);
      };
    }

    return isCorrect;
  }

  public getScoreFromStage(difficulty: string | number, stage: GAME_STAGE): number {
    const difficultyNum = typeof difficulty === 'number' ? difficulty : parseFloat(difficulty);
    let score = difficultyNum;

    switch (stage) {
      case GAME_STAGE.CLUE_0:
        score = difficultyNum;
        break;
      case GAME_STAGE.CLUE_1:
        score = Math.max(1, Math.floor(difficultyNum / 2));
        break;
      case GAME_STAGE.CLUE_2:
        score = Math.max(1, Math.floor(difficultyNum / 4));
        break;
    }
    return score;
  }

  async endCurrentGame(chatId: number, telegramMessageThreadId: number | undefined): Promise<void> {
    await this.gameTimerService.stopTimer(chatId, telegramMessageThreadId);

    // Remove ongoing game record entirely
    await this.gameModel.deleteOne(
      { telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId }
    ).exec();
  }
}