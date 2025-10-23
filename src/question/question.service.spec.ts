import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { QuestionService } from './question.service';
import { Question } from './question.schema';
import { QuestionHistory } from './question-history.schema';
import { IncorrectAnswer } from './incorrect-answer.schema';

describe('QuestionService', () => {
  let service: QuestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionService,
        { provide: getModelToken(Question.name), useValue: {} },
        { provide: getModelToken(QuestionHistory.name), useValue: {} },
        { provide: getModelToken(IncorrectAnswer.name), useValue: {} },
      ],
    }).compile();

    service = module.get<QuestionService>(QuestionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
