import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GAME_STAGE } from 'src/game/game.schema';
import { Question, QuestionDocument } from 'src/question/question.schema';
import { QuestionHistory, QuestionHistoryDocument } from './question-history.schema';
import { QUESTION_TYPE } from './question-type';

export const MASK_CHARACTER = '●';
@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    @InjectModel(QuestionHistory.name) private questionHistoryModel: Model<QuestionHistoryDocument>,
  ) { }

  async getRandomQuestion(type: QUESTION_TYPE): Promise<Question> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          $or: [
            { lastAskedAt: { $lt: twentyFourHoursAgo } },
            { lastAskedAt: { $eq: null } }
          ],
          isDeleted: false,
          type: String(type)
        },
      },
      {
        $sample: { size: 1 }
      }
    ];

    const result = await this.questionModel.aggregate(pipeline).exec();

    if (result.length === 0) {
      const oldestQuestion = await this.questionModel
        .findOne({ isDeleted: false })
        .sort({ lastAskedAt: 1 })
        .exec();

      if (oldestQuestion) {
        return oldestQuestion;
      }

      this.logger.log('No questions available in the database.');
    }

    return result[0] as Question;
  }

  public generateClue(question: QuestionDocument, stage: GAME_STAGE): string {
    // TODO use question.hint for CLUE_1 if available
    /* if (stage === GAME_STAGE.CLUE_1 && question.hint) {
      return question.hint;
    } */

    return this.generateMaskedAnswerClue(question.answer, stage);
  }

  public async saveHistoryQuestion(telegramChatId: number, telegramMessageThreadId: number | undefined, questionId: string, score: number = 0, playerId: string | null = null): Promise<QuestionHistory> {
    const historyEntry = await this.questionHistoryModel.create({
      telegramChatId: telegramChatId,
      telegramMessageThreadId: telegramMessageThreadId,
      question: questionId,
      playerId: playerId,
      score: score
    });
    return historyEntry;
  }

  public generateMaskedAnswerClue(answer: string, stage: GAME_STAGE): string {

    const ALPHANUMERIC_REGEX = /[\p{L}\p{N}]/u;
    const ALPHANUMERIC_GLOBAL_REGEX = /[\p{L}\p{N}]/gu;

    const alphanumericMatches = answer.match(ALPHANUMERIC_GLOBAL_REGEX) || [];
    const totalChars = alphanumericMatches.length;

    if (totalChars === 0) {
      return '';
    }

    let revealPercentage: number;
    switch (stage) {
      case GAME_STAGE.CLUE_0:
        return answer.replace(ALPHANUMERIC_GLOBAL_REGEX, MASK_CHARACTER);
      case GAME_STAGE.CLUE_1:
        revealPercentage = 0.3;
        break;
      case GAME_STAGE.CLUE_2:
        revealPercentage = 0.65;
        break;
      case GAME_STAGE.REVEAL:
        return answer;
      default:
        return answer.replace(ALPHANUMERIC_GLOBAL_REGEX, MASK_CHARACTER);
    }

    const charsToReveal = Math.min(
      totalChars,
      Math.max(1, Math.floor(totalChars * revealPercentage))
    );

    const indicesToReveal = new Set<number>();

    if (charsToReveal > 0) {
      indicesToReveal.add(0);
    }

    while (indicesToReveal.size < charsToReveal) {
      const randomIndex = Math.floor(Math.random() * totalChars);
      indicesToReveal.add(randomIndex);
    }

    let maskedAnswer = '';
    let alphaIndex = 0;
    const alphanumericRegex = ALPHANUMERIC_REGEX;
    for (const char of answer) {
      if (char === ' ') {
        // always show spaces
        maskedAnswer += char;
      } else if (!alphanumericRegex.test(char)) {
        // always show special symbols
        maskedAnswer += char;
      } else {
        // mask or reveal alphanumeric based on indicesToReveal
        if (indicesToReveal.has(alphaIndex)) {
          maskedAnswer += char;
        } else {
          maskedAnswer += MASK_CHARACTER;
        }
        alphaIndex++;
      }
    }

    return maskedAnswer;
  }


  async markAsAsked(questionId: string): Promise<void> {
    await this.questionModel.updateOne(
      { _id: questionId },
      { $set: { lastAskedAt: new Date() } }
    ).exec();
  }

  async create(questionData: Partial<Question>): Promise<Question> {
    return this.questionModel.create(questionData);
  }
}