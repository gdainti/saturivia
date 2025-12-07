import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { QuestionService } from './question.service';
import { Question } from './question.schema';
import { QuestionHistory } from './question-history.schema';
import { IncorrectAnswer } from './incorrect-answer.schema';
import { Model } from 'mongoose';
import { QUESTION_TYPE } from './question-type';
import { InternalServerErrorException } from '@nestjs/common';

const mockQuestionModel = {
  aggregate: jest.fn(),
  findById: jest.fn(),
};

const mockQuestionHistoryModel = {};
const mockIncorrectAnswerModel = {};

describe('QuestionService', () => {
  let service: QuestionService;
  let model: Model<Question>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionService,
        { provide: getModelToken(Question.name), useValue: mockQuestionModel },
        {
          provide: getModelToken(QuestionHistory.name),
          useValue: mockQuestionHistoryModel,
        },
        {
          provide: getModelToken(IncorrectAnswer.name),
          useValue: mockIncorrectAnswerModel,
        },
      ],
    }).compile();

    service = module.get<QuestionService>(QuestionService);
    model = module.get<Model<Question>>(getModelToken(Question.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRandomQuestion', () => {
    it('should return a question from aggregation', async () => {
      const aggregatedQuestion = {
        _id: 'agg-id',
        question: 'aggregated',
        lastAskedAt: new Date(),
      };
      (mockQuestionModel.aggregate as jest.Mock).mockResolvedValue([
        aggregatedQuestion,
      ]);
      (mockQuestionModel.findById as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(aggregatedQuestion),
      });

      const question = await service.getRandomQuestion(QUESTION_TYPE.TRIVIA);

      expect(question).toEqual(aggregatedQuestion);
      expect(mockQuestionModel.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            isDeleted: false,
            type: String(QUESTION_TYPE.TRIVIA),
          },
        },
        { $sample: { size: 100 } },
        { $sort: { lastAskedAt: 1 } },
        { $limit: 1 },
      ]);
      expect(mockQuestionModel.findById).toHaveBeenCalledWith(
        aggregatedQuestion._id,
      );
    });

    it('should throw an error if no questions are available', async () => {
      (mockQuestionModel.aggregate as jest.Mock).mockResolvedValue([]);

      await expect(
        service.getRandomQuestion(QUESTION_TYPE.TRIVIA),
      ).rejects.toThrow(
        new InternalServerErrorException(
          `No questions available for type: ${QUESTION_TYPE.TRIVIA}`,
        ),
      );
    });
  });
});