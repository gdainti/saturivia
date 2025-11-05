import { TelegramService } from './telegram.service';

describe('trimBotMention', () => {
  let service: TelegramService;
  const botUsername = 'TestBot';

  beforeEach(() => {
    // @ts-ignore
    service = new TelegramService({}, {}, {}, {});
  });

  it('removes mention at the beginning', () => {
    const text = '@TestBot hello world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention at the end', () => {
    const text = 'hello world @TestBot';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention between words', () => {
    const text = 'hello @TestBot world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes multiple mentions', () => {
    const text = '@TestBot hello @TestBot world @TestBot!';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention with extra spaces and punctuation', () => {
    const text = 'hello, @TestBot: world!';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('returns original text if no mention', () => {
    const text = 'hello world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('returns original text if botUsername is undefined', () => {
    const text = '@TestBot hello world';
    expect(service['trimBotMention'](text, undefined)).toBe(text);
  });

  it('removes mention with no @', () => {
    const text = 'hello TestBot world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention with mixed case', () => {
    const text = 'hello @testbot world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });
});
