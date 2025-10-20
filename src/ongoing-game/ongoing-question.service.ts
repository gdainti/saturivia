import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QuestionService } from '../question/question.service';
import { PlayerService } from '../player/player.service';
import { GAME_STAGE, OngoingQuestion, OngoingQuestionDocument } from 'src/schemas/ongoing-question.schema';
import { QuestionDocument } from 'src/schemas/question.schema';

@Injectable()
export class OngoingQuestionService {
  constructor(
    @InjectModel(OngoingQuestion.name) private ongoingQuestionModel: Model<OngoingQuestionDocument>,
    private questionService: QuestionService,
    private playerService: PlayerService,
  ) {}

  async getGame(chatId: number): Promise<OngoingQuestion> {
    const game = await this.ongoingQuestionModel
      .findOne({ telegramChatId: chatId, isDeleted: false })
      .populate('questionId')
      .populate('guesserId')
      .exec();

    if (!game) {
      throw new NotFoundException(`No active game found for chat ${chatId}`);
    }
    return game;
  }

  async startNewGame(chatId: number): Promise<OngoingQuestion | null> {
    const question = await this.questionService.getRandomQuestion() as QuestionDocument;

    await this.questionService.markAsAsked(question._id as string);

    const newGame = await this.ongoingQuestionModel.findOneAndUpdate(
      { telegramChatId: chatId },
      {
        questionId: question._id,
        stage: GAME_STAGE.CLUE_0,
        guesserId: null,
        isDeleted: false,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();

    return this.ongoingQuestionModel.findById(newGame._id).populate('questionId').exec();
  }

  async advanceStage(chatId: number, newStage: GAME_STAGE): Promise<OngoingQuestion> {
    const updatedGame = await this.ongoingQuestionModel.findOneAndUpdate(
      { telegramChatId: chatId, isDeleted: false },
      { $set: { stage: newStage } },
      { new: true }
    ).exec();

    if (!updatedGame) {
      throw new NotFoundException(`Game not found or already ended for chat ${chatId}`);
    }

    return updatedGame;
  }

  async checkAnswer(chatId: number, answer: string, telegramUserId?: number, username?: string): Promise<boolean> {
    const game = await this.ongoingQuestionModel.findOne({ telegramChatId: chatId, isDeleted: false }).populate('questionId').exec();
    if (!game) throw new NotFoundException(`No active game found for chat ${chatId}`);

    const correctAnswer = (game.questionId as any).answer as string;
    if (!correctAnswer) return false;

    const normalizedGiven = answer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();

    const isCorrect = normalizedCorrect.includes(normalizedGiven) || normalizedGiven.includes(normalizedCorrect) || normalizedGiven === normalizedCorrect;

    if (isCorrect && telegramUserId) {
      const player = await this.playerService.findOrCreatePlayer(telegramUserId, username);
      await this.playerService.recordPlayerAnswer((game.questionId as any)._id as string, (player as any)._id as string, 1);
    }

    return isCorrect;
  }

  async endCurrentGame(chatId: number): Promise<void> {
    await this.ongoingQuestionModel.findOneAndUpdate(
      { telegramChatId: chatId, isDeleted: false },
      { $set: { isDeleted: true, guesserId: null, clue: null } }
    ).exec();
  }
}