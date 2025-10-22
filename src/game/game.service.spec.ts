import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GameService } from './game.service';
import { Game } from './game.schema';
import { QuestionHistory } from '../question/question-history.schema';
import { QuestionService } from '../question/question.service';
import { GameTimerService } from './game-timer.service';
import { TelegramService } from '../telegram/telegram.service';

describe('GameService', () => {
  let service: GameService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        { provide: getModelToken(Game.name), useValue: {} },
        { provide: getModelToken(QuestionHistory.name), useValue: {} },
        { provide: QuestionService, useValue: {} },
        { provide: GameTimerService, useValue: {} },
        { provide: TelegramService, useValue: {} },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
  describe('checkAnswer()', () => {
    const chatId = 123;
    const threadId = 456;
    const makeGame = (ans: string) => ({ question: { answer: ans } } as any);

    it('returns true for exact match', async () => {
      const result = await service.checkAnswer(chatId, threadId, 'Tokyo', makeGame('Tokyo'));
      expect(result).toBe(true);
    });

    it('is case-insensitive', async () => {
      const result = await service.checkAnswer(chatId, threadId, 'tokyo', makeGame('ToKyO'));
      expect(result).toBe(true);
    });

    it('does not accept substrings as correct', async () => {
      // substring only should be false
      const sub = await service.checkAnswer(chatId, threadId, 'Q', makeGame('QUESTION'));
      expect(sub).toBe(false);
    });

    it('strips surrounding quotes before comparing', async () => {
      const dq = await service.checkAnswer(chatId, threadId, '"Paris"', makeGame('Paris'));
      expect(dq).toBe(true);
      const sq = await service.checkAnswer(chatId, threadId, "'Rome'", makeGame('Rome'));
      expect(sq).toBe(true);
    });

    it('removes trailing punctuation before comparing', async () => {
      const ex = await service.checkAnswer(chatId, threadId, 'Tokyo!!!', makeGame('Tokyo'));
      expect(ex).toBe(true);
      const qu = await service.checkAnswer(chatId, threadId, 'Berlin?', makeGame('Berlin'));
      expect(qu).toBe(true);
    });

    it('returns false for non-matching answers', async () => {
      const result = await service.checkAnswer(chatId, threadId, 'Berlin', makeGame('Paris'));
      expect(result).toBe(false);
    });

    it('returns false if correct answer is empty', async () => {
      const result = await service.checkAnswer(chatId, threadId, 'anything', makeGame(''));
      expect(result).toBe(false);
    });

    it('throws NotFoundException if no game provided', async () => {
      await expect(service.checkAnswer(chatId, threadId, 'x', null as any)).rejects.toThrow('No active game found');
    });
  });
});
