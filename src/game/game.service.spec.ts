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

    it('correctly matches aspect ratios with colons', async () => {
      const result = await service.checkAnswer(makeGame('16:9'), '16:9', chatId, threadId);
      expect(result).toBe(true);
    });

    it('correctly matches various colon-separated values', async () => {
      // Test different aspect ratios
      const test1 = await service.checkAnswer(makeGame('4:3'), '4:3', chatId, threadId);
      expect(test1).toBe(true);

      // Test time format
      const test2 = await service.checkAnswer(makeGame('12:30'), '12:30', chatId, threadId);
      expect(test2).toBe(true);

      // Test with spaces around colon (should not match)
      const test3 = await service.checkAnswer(makeGame('16:9'), '16 : 9', chatId, threadId);
      expect(test3).toBe(false);
    });

    it('handles special characters in answers correctly', async () => {
      // Test with single quotes around colon values
      const test1 = await service.checkAnswer(makeGame('16:9'), "'16:9'", chatId, threadId);
      expect(test1).toBe(true);

      // Test with double quotes
      const test2 = await service.checkAnswer(makeGame('16:9'), '"16:9"', chatId, threadId);
      expect(test2).toBe(true);

      // Test with trailing punctuation
      const test3 = await service.checkAnswer(makeGame('16:9'), '16:9.', chatId, threadId);
      expect(test3).toBe(true);
    });

    it('compares exact strings from production logs', async () => {
      // These are the exact strings copied from your logs
      const correctAnswer = '16:9';
      const givenAnswer = '16:9';

      // First, let's examine the character codes
      console.log('Correct answer char codes:', [...correctAnswer].map(c => c.charCodeAt(0)));
      console.log('Given answer char codes:', [...givenAnswer].map(c => c.charCodeAt(0)));
      console.log('Correct answer length:', correctAnswer.length);
      console.log('Given answer length:', givenAnswer.length);
      console.log('Are they === equal?', correctAnswer === givenAnswer);

      // Test with the actual checkAnswer method
      const result = await service.checkAnswer(makeGame(correctAnswer), givenAnswer, chatId, threadId);
      expect(result).toBe(true);
    });

    it('detects lookalike characters that could cause production issues', async () => {
      // Test various colon-like characters that might appear in logs
      const normalColon = '16:9'; // U+003A (normal colon)
      const fullwidthColon = '16：9'; // U+FF1A (fullwidth colon)
      const modifierLetterColon = '16ː9'; // U+02D0 (modifier letter triangular colon)
      const ratioSign = '16∶9'; // U+2236 (ratio sign)

      console.log('Normal colon char codes:', [...normalColon].map(c => c.charCodeAt(0)));
      console.log('Fullwidth colon char codes:', [...fullwidthColon].map(c => c.charCodeAt(0)));
      console.log('Modifier colon char codes:', [...modifierLetterColon].map(c => c.charCodeAt(0)));
      console.log('Ratio sign char codes:', [...ratioSign].map(c => c.charCodeAt(0)));

      // These should NOT match
      const test1 = await service.checkAnswer(makeGame(normalColon), fullwidthColon, chatId, threadId);
      const test2 = await service.checkAnswer(makeGame(normalColon), modifierLetterColon, chatId, threadId);
      const test3 = await service.checkAnswer(makeGame(normalColon), ratioSign, chatId, threadId);

      expect(test1).toBe(false); // Different Unicode characters
      expect(test2).toBe(false); // Different Unicode characters
      expect(test3).toBe(false); // Different Unicode characters
    });

    it('handles potential invisible characters and normalization', async () => {
      const normalAnswer = '16:9';

      // Test with zero-width spaces (invisible characters that might be in logs)
      const withZeroWidthSpace = '16\u200B:9'; // Zero-width space between 6 and :
      const withZeroWidthNonBreaker = '16:\u200C9'; // Zero-width non-joiner between : and 9

      console.log('Normal answer char codes:', [...normalAnswer].map(c => c.charCodeAt(0)));
      console.log('With zero-width space char codes:', [...withZeroWidthSpace].map(c => c.charCodeAt(0)));
      console.log('With zero-width non-breaker char codes:', [...withZeroWidthNonBreaker].map(c => c.charCodeAt(0)));

      // These should NOT match because they contain invisible characters
      const test1 = await service.checkAnswer(makeGame(normalAnswer), withZeroWidthSpace, chatId, threadId);
      const test2 = await service.checkAnswer(makeGame(normalAnswer), withZeroWidthNonBreaker, chatId, threadId);

      expect(test1).toBe(false);
      expect(test2).toBe(false);
    });

    it('throws NotFoundException if no game provided', async () => {
      await expect(service.checkAnswer(null as any, 'x', chatId, threadId)).rejects.toThrow('No active game found');
    });
  });
});
