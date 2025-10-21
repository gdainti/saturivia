import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuestionService } from '../question/question.service';
import { PlayerService } from '../player/player.service';
import { GAME_STAGE, OngoingQuestion, OngoingQuestionDocument } from 'src/schemas/ongoing-question.schema';
import { QuestionDocument } from 'src/schemas/question.schema';
import { GameTimerService } from './game-timer.service';

@Injectable()
export class OngoingQuestionService {
  private readonly logger = new Logger(OngoingQuestionService.name);

  constructor(
    @InjectModel(OngoingQuestion.name) private ongoingQuestionModel: Model<OngoingQuestionDocument>,
    private questionService: QuestionService,
    private playerService: PlayerService,
    private gameTimerService: GameTimerService,
  ) { }

  async getGame(chatId: number, messageId: number): Promise<OngoingQuestion | null> {
    const game = await this.ongoingQuestionModel
      .findOne({ telegramChatId: chatId, telegramMessageId: messageId, isDeleted: false })
      .populate('questionId')
      .populate('guesserId')
      .exec();

    return game || null;
  }

  async startNewGame(chatId: number, messageId: number): Promise<OngoingQuestion | null> {
    const question = await this.questionService.getRandomQuestion() as QuestionDocument;

    if (!question) {
      return null;
    }

    await this.questionService.markAsAsked(question._id as string);

    const newGame = await this.ongoingQuestionModel.findOneAndUpdate(
      {
        telegramChatId: chatId,
        telegramMessageId: messageId
      },
      {
        telegramChatId: chatId,
        telegramMessageId: messageId,
        questionId: question._id,
        stage: GAME_STAGE.CLUE_0,
        guesserId: null,
        isDeleted: false,
        lastClueAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();

    // Start the timer for this game
    await this.gameTimerService.startTimer(chatId, messageId, question.type, GAME_STAGE.CLUE_0);

    return this.ongoingQuestionModel.findById(newGame._id).populate('questionId').exec();
  }

  async advanceStage(telegramChatId: number, telegramMessageId: number, newStage: GAME_STAGE): Promise<OngoingQuestion> {
    const updatedGame = await this.ongoingQuestionModel.findOneAndUpdate(
      {
        telegramChatId: telegramChatId,
        telegramMessageId: telegramMessageId,
        isDeleted: false,
      },
      { $set: { stage: newStage } },
      { new: true }
    ).exec();

    if (!updatedGame) {
      throw new NotFoundException(`Game not found or already ended for chat ${telegramChatId} message ${telegramMessageId}`);
    }

    return updatedGame;
  }

  async checkAnswer(telegramChatId: number, telegramMessageId: number, answer: string, telegramUserId?: number, username?: string): Promise<boolean> {
    const game = await this.ongoingQuestionModel.findOne({ telegramChatId: telegramChatId, isDeleted: false }).populate('questionId').exec();
    if (!game) throw new NotFoundException(`No active game found for chat ${telegramChatId} message ${telegramMessageId}`);

    const correctAnswer = (game.questionId as any).answer as string;
    if (!correctAnswer) return false;

    const normalizedGiven = answer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();

    const isCorrect = normalizedCorrect.includes(normalizedGiven) || normalizedGiven.includes(normalizedCorrect) || normalizedGiven === normalizedCorrect;

    if (isCorrect) {
      // Stop the timer as game is won
      await this.gameTimerService.stopTimer(telegramChatId, telegramMessageId);

      if (telegramUserId) {
        const player = await this.playerService.findOrCreatePlayer(telegramUserId, username);
        await this.playerService.recordPlayerAnswer((game.questionId as any)._id as string, (player as any)._id as string, 1);
      }

      // End the game
      await this.endCurrentGame(telegramChatId, telegramMessageId);
    }

    return isCorrect;
  }

  async endCurrentGame(chatId: number, messageId: number): Promise<void> {
    // Stop any active timers
    await this.gameTimerService.stopTimer(chatId, messageId);

    // Remove ongoing game record entirely
    await this.ongoingQuestionModel.deleteOne(
      { telegramChatId: chatId, telegramMessageId: messageId }
    ).exec();
  }
}