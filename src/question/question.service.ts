import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from 'src/schemas/question.schema';


@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  async getRandomQuestion(): Promise<Question> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          $or: [
            { lastAskedAt: { $lt: twentyFourHoursAgo } },
            { lastAskedAt: { $eq: null } }
          ],
          isDeleted: false
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