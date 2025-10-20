import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { QuestionService } from 'src/question/question.service';
import { PlayerService } from 'src/player/player.service';
import { OngoingQuestionService } from 'src/ongoing-game/ongoing-question.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(
    private configService: ConfigService,
    private questionService: QuestionService,
    private playerService: PlayerService,
    private ongoingQuestionService: OngoingQuestionService,
  ) {}

  onModuleInit() {
    const token =
      this.configService.get<string>('NODE_ENV') === 'production'
        ? this.configService.get<string>('TELEGRAM_BOT_TOKEN')
        : this.configService.get<string>('TELEGRAM_BOT_TOKEN_TEST');

    if (!token) {
      this.logger.warn('No token provided; telegram bot will not start.');
      return;
    }

    this.bot = new Telegraf(token);

    this.bot.start(async (ctx) => {
      await ctx.reply('Welcome to Saturivia!');
    });

    this.bot.command('question', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      try {
        const existing = await this.ongoingQuestionService.getGame(chatId);
        const existingQuestion = (existing as any).questionId?.question ?? 'An active question is already running.';
        await ctx.reply(`A game is already active in this chat. Question: ${existingQuestion}`);
        return;
      } catch (err) {
        console.error('Error checking existing game', err);
      }

      const game = await this.ongoingQuestionService.startNewGame(chatId);
      if (!game) {
        await ctx.reply('Could not start a new game.');
        return;
      }

      const question = (game as any).questionId?.question ?? 'No question available';
      await ctx.reply(`Question: ${question}`);
    });

    this.bot.command('scoreboard', async (ctx) => {
      const top = await this.playerService.getTopPlayers(5);
      if (!top || top.length === 0) {
        await ctx.reply('No scores yet. Play some games!');
        return;
      }

      const lines = top.map((t, i) => `${i + 1}. ${t.username ?? t.telegramId} — ${t.totalScore}`);
      await ctx.reply(['Top players:', ...lines].join('\n'));
    });

    this.bot.on('text', async (ctx) => {
      const chatId = ctx.chat?.id;
      const from = ctx.from;
      const text = ctx.message?.text ?? '';
      if (!chatId || !from || !text) return;

      if (text.startsWith('/')) return;

      try {
        const game = await this.ongoingQuestionService.getGame(chatId);
        const isCorrect = await this.ongoingQuestionService.checkAnswer(chatId, text, from.id, from.username);

        if (isCorrect) {
          const correctAnswer = (game as any).questionId?.answer ?? 'the answer';
          await ctx.reply(`🎉 Correct! The answer was: ${correctAnswer}`);
          await this.ongoingQuestionService.endCurrentGame(chatId);
        } else {
          const correctAnswer = (game as any).questionId?.answer ?? '';
          try {
            const givenLen = String(text).trim().length;
            const answerLen = String(correctAnswer).trim().length;
            if (givenLen > 0 && givenLen === answerLen) {
              const msgId = (ctx.message as any).message_id;
              await ctx.reply('❌', ({ reply_to_message_id: msgId } as any));
            } else {
              // ignore messages that are not the same length as the answer
            }
          } catch (err) {
            this.logger.warn('Failed to react to message', err);
          }
        }
      } catch (err) {
        // if no active game, ignore
      }
    });

    this.bot.launch().then(() => this.logger.log('Telegram bot launched')).catch((err) => this.logger.error('Failed to launch Telegram bot', err));
  }

  async onModuleDestroy() {
    if (this.bot) {
      await this.bot.stop();
      this.logger.log('Telegram bot stopped');
    }
  }
}
