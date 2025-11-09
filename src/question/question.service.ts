// ...existing code...
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GAME_STAGE } from 'src/game/game.schema';
import { Question, QuestionDocument } from 'src/question/question.schema';
import {
  QuestionHistory,
  QuestionHistoryDocument,
} from './question-history.schema';
import { QUESTION_TYPE } from './question-type';
import {
  IncorrectAnswer,
  IncorrectAnswerDocument,
} from 'src/question/incorrect-answer.schema';

export const MASK_CHARACTER = '●';
@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    @InjectModel(QuestionHistory.name)
    private questionHistoryModel: Model<QuestionHistoryDocument>,
    @InjectModel(IncorrectAnswer.name)
    private incorrectAnswerModel: Model<IncorrectAnswerDocument>,
  ) {}

  async getTotalWrongAnswers(
    playerId: string | undefined = undefined,
  ): Promise<number> {
    let playersFilter = {};
    if (playerId) {
      playersFilter = { playerId: playerId };
    }
    return this.incorrectAnswerModel.countDocuments(playersFilter).exec();
  }

  async getCorrectAnswersCount(
    playerId: string | undefined = undefined,
  ): Promise<number> {
    let playerIdFilter = {};

    if (playerId) {
      playerIdFilter = { playerId: playerId };
    } else {
      playerIdFilter = { playerId: { $exists: true, $ne: null } };
    }

    return this.questionHistoryModel.countDocuments(playerIdFilter).exec();
  }

  async getRandomQuestion(type: QUESTION_TYPE): Promise<Question> {
    const neverAskedCount = await this.questionModel
      .countDocuments({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $eq: null },
      })
      .exec();

    if (neverAskedCount > 0) {
      const randomSkip = Math.floor(Math.random() * neverAskedCount);
      const neverAskedQuestion = await this.questionModel
        .findOne({
          isDeleted: false,
          type: String(type),
          lastAskedAt: { $eq: null },
        })
        .skip(randomSkip)
        .exec();

      if (neverAskedQuestion) {
        return neverAskedQuestion;
      }
    }

    const totalAskedCount = await this.questionModel
      .countDocuments({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $ne: null },
      })
      .exec();

    if (totalAskedCount === 0) {
      this.logger.log('No questions available in the database.');
      throw new InternalServerErrorException('No questions available');
    }

    let poolSize: number;
    if (totalAskedCount < 1000) {
      poolSize = Math.max(1, Math.floor(totalAskedCount * 0.2));
    } else if (totalAskedCount < 10000) {
      poolSize = Math.floor(totalAskedCount * 0.1);
    } else {
      poolSize = Math.min(3000, Math.floor(totalAskedCount * 0.05));
    }

    const oldestQuestions = await this.questionModel
      .find({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $ne: null },
      })
      .sort({ lastAskedAt: 1 })
      .limit(poolSize)
      .exec();

    const randomIndex = Math.floor(Math.random() * oldestQuestions.length);
    return oldestQuestions[randomIndex];
  }

  public generateClue(question: QuestionDocument, stage: GAME_STAGE): string {
    // TODO use question.hint for CLUE_1 if available
    /* if (stage === GAME_STAGE.CLUE_1 && question.hint) {
      return question.hint;
    } */

    return this.generateMaskedAnswerClue(question.answer, stage);
  }

  public async saveHistoryQuestion(
    telegramChatId: number,
    telegramMessageThreadId: number | undefined,
    questionId: string,
    score: number = 0,
    playerId: string | null = null,
    triggeredPlayerId: string,
    stage: GAME_STAGE,
  ): Promise<QuestionHistory> {
    const historyEntry = await this.questionHistoryModel.create({
      telegramChatId: telegramChatId,
      telegramMessageThreadId: telegramMessageThreadId,
      question: questionId,
      playerId: playerId,
      triggeredPlayerId: triggeredPlayerId,
      score: score,
      stage: stage,
    });
    return historyEntry;
  }

  public async saveIncorrectAnswer(
    telegramChatId: number,
    telegramMessageThreadId: number | undefined,
    questionId: string,
    playerId: string,
    answer: string,
  ): Promise<IncorrectAnswer> {
    const incorrectAnswerEntry = await this.incorrectAnswerModel.create({
      telegramChatId: telegramChatId,
      telegramMessageThreadId: telegramMessageThreadId,
      question: questionId,
      playerId: playerId,
      answer: answer,
    });
    return incorrectAnswerEntry;
  }

  public async getIncorrectAnswersForQuestion(
    telegramChatId: number,
    telegramMessageThreadId: number | undefined,
    questionId: string,
    playerId: string,
  ): Promise<number> {
    return this.incorrectAnswerModel
      .countDocuments({
        question: questionId,
        playerId: playerId,
        telegramChatId: telegramChatId,
        telegramMessageThreadId: telegramMessageThreadId,
        isDeleted: false,
      })
      .exec();
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
      case GAME_STAGE.RESULT:
        return answer;
      default:
        return answer.replace(ALPHANUMERIC_GLOBAL_REGEX, MASK_CHARACTER);
    }

    const charsToReveal = Math.min(
      totalChars,
      Math.max(1, Math.floor(totalChars * revealPercentage)),
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
    await this.questionModel
      .updateOne({ _id: questionId }, { $set: { lastAskedAt: new Date() } })
      .exec();
  }

  /**
   * Alternative approach: Dynamic pool size based on question count
   * Scales better with your 100k+ questions
   */
  async getRandomQuestionDynamic(type: QUESTION_TYPE): Promise<Question> {
    const totalQuestions = await this.questionModel
      .countDocuments({
        isDeleted: false,
        type: String(type),
      })
      .exec();

    if (totalQuestions === 0) {
      throw new InternalServerErrorException('No questions available');
    }

    // Dynamic pool size: 0.5% of total questions, min 100, max 2000
    const dynamicPoolSize = Math.max(
      100,
      Math.min(2000, Math.floor(totalQuestions * 0.005)),
    );

    // Prioritize never-asked questions first
    const neverAskedCount = await this.questionModel
      .countDocuments({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $eq: null },
      })
      .exec();

    if (neverAskedCount > 0) {
      const takeFromNeverAsked = Math.min(
        neverAskedCount,
        Math.floor(dynamicPoolSize * 0.7),
      ); // 70% from never-asked
      const neverAskedQuestions = await this.questionModel
        .find({
          isDeleted: false,
          type: String(type),
          lastAskedAt: { $eq: null },
        })
        .limit(takeFromNeverAsked)
        .exec();

      const remainingPoolSize = dynamicPoolSize - takeFromNeverAsked;
      let oldestQuestions: any[] = [];

      if (remainingPoolSize > 0) {
        oldestQuestions = await this.questionModel
          .find({
            isDeleted: false,
            type: String(type),
            lastAskedAt: { $ne: null },
          })
          .sort({ lastAskedAt: 1 })
          .limit(remainingPoolSize)
          .exec();
      }

      const combinedPool = [...neverAskedQuestions, ...oldestQuestions];
      const randomIndex = Math.floor(Math.random() * combinedPool.length);
      return combinedPool[randomIndex];
    }

    // If no never-asked questions, use your original approach
    const oldestQuestions = await this.questionModel
      .find({
        isDeleted: false,
        type: String(type),
      })
      .sort({ lastAskedAt: 1 })
      .limit(dynamicPoolSize)
      .exec();

    const randomIndex = Math.floor(Math.random() * oldestQuestions.length);
    return oldestQuestions[randomIndex];
  }

  /**
   * Percentile-based approach: Always pick from bottom X% of recently asked
   * Most mathematically sound for large datasets
   */
  async getRandomQuestionPercentile(
    type: QUESTION_TYPE,
    percentile: number = 0.1,
  ): Promise<Question> {
    const totalQuestions = await this.questionModel
      .countDocuments({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $ne: null },
      })
      .exec();

    const neverAskedCount = await this.questionModel
      .countDocuments({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $eq: null },
      })
      .exec();

    // Always prioritize never-asked questions
    if (neverAskedCount > 0) {
      const randomSkip = Math.floor(Math.random() * neverAskedCount);
      const question = await this.questionModel
        .findOne({
          isDeleted: false,
          type: String(type),
          lastAskedAt: { $eq: null },
        })
        .skip(randomSkip)
        .exec();

      if (question) return question;
    }

    if (totalQuestions === 0) {
      throw new InternalServerErrorException('No questions available');
    }

    // Take bottom X% (oldest) questions
    const poolSize = Math.floor(totalQuestions * percentile);
    const actualPoolSize = Math.max(1, poolSize); // At least 1 question

    const oldestQuestions = await this.questionModel
      .find({
        isDeleted: false,
        type: String(type),
        lastAskedAt: { $ne: null },
      })
      .sort({ lastAskedAt: 1 })
      .limit(actualPoolSize)
      .exec();

    const randomIndex = Math.floor(Math.random() * oldestQuestions.length);
    return oldestQuestions[randomIndex];
  }

  async create(questionData: Partial<Question>): Promise<Question> {
    return this.questionModel.create(questionData);
  }

  public async getTotalQuestions(): Promise<number> {
    return this.questionModel.countDocuments({ isDeleted: false }).exec();
  }

  public async getTotalHistoryQuestions(
    playerId: string | undefined = undefined,
  ): Promise<number> {
    return this.questionHistoryModel
      .countDocuments({ playerId: playerId })
      .exec();
  }
}
