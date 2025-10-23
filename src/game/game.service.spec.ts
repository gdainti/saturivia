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
      const result = await service.checkAnswer(makeGame('Tokyo'), 'Tokyo', chatId, threadId);
      expect(result).toBe(true);
    });

    it('is case-insensitive', async () => {
      const result = await service.checkAnswer(makeGame('TokyO'), 'Tokyo', chatId, threadId);
      expect(result).toBe(true);
    });

    it('does not accept substrings as correct', async () => {
      // substring only should be false
      const sub = await service.checkAnswer(makeGame('QUESTION'), 'Q', chatId, threadId);
      expect(sub).toBe(false);
    });

    it('strips surrounding quotes before comparing', async () => {
      const dq = await service.checkAnswer(makeGame('Paris'), '"Paris"', chatId, threadId);
      expect(dq).toBe(true);
      const sq = await service.checkAnswer(makeGame('Rome'), "'Rome'", chatId, threadId);
      expect(sq).toBe(true);
    });

    it('removes trailing punctuation before comparing', async () => {
      const ex = await service.checkAnswer(makeGame('Tokyo'), 'Tokyo!!!', chatId, threadId);
      expect(ex).toBe(true);
      const qu = await service.checkAnswer(makeGame('Berlin'), 'Berlin?', chatId, threadId);
      expect(qu).toBe(true);
    });

    it('returns false for non-matching answers', async () => {
      const result = await service.checkAnswer(makeGame('Paris'), 'Berlin', chatId, threadId);
      expect(result).toBe(false);
    });

    it('returns false if correct answer is empty', async () => {
      const result = await service.checkAnswer(makeGame(''), 'anything', chatId, threadId);
      expect(result).toBe(false);
    });

    it('treats Cyrillic ё and е as equal', async () => {
      // correct contains ё, given with е
      const test1 = await service.checkAnswer(makeGame('ёлка'), 'елка', chatId, threadId,);
      expect(test1).toBe(true);
      // correct contains е, given with ё
      const test2 = await service.checkAnswer(makeGame('елка'), 'ёлка', chatId, threadId,);
      expect(test2).toBe(true);
    });

    it('throws NotFoundException if no game provided', async () => {
      await expect(service.checkAnswer(null as any, 'x', chatId, threadId)).rejects.toThrow('No active game found');
    });
  });
});
