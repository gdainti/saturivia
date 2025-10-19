import { Test, TestingModule } from '@nestjs/testing';
import { OngoingQuestionService } from './ongoing-question.service';

describe('OngoingQuestionService', () => {
  let service: OngoingQuestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OngoingQuestionService],
    }).compile();

    service = module.get<OngoingQuestionService>(OngoingQuestionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
