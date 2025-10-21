import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { QuestionService } from 'src/question/question.service';
import { PlayerService } from 'src/player/player.service';
import { OngoingQuestionService } from 'src/ongoing-game/ongoing-question.service';
import { QuestionDocument } from 'src/schemas/question.schema';
import { OngoingQuestion } from 'src/schemas/ongoing-question.schema';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(
    private configService: ConfigService,
    private questionService: QuestionService,
    private playerService: PlayerService,
    private ongoingQuestionService: OngoingQuestionService,
  ) { }

  onModuleInit() {
    try {
      this.init();
    }
    catch (err) {
      this.logger.error('Failed to initialize Telegram bot', err);
    }
  }

  private renderQuestionMessage(question: string, label: string = 'Question:', difficulty: string | number, category?: string): string {
    let message = `${label} ${question}\n`;
    if (category) {
      message += `Category: ${category}\n`;
    }
    if (difficulty) {
      message += `Difficulty: ${difficulty}\n`;
    }
    return message;
  }

  private async init() {

    if (this.bot) {
      await this.bot.stop('SIGINT');
      await this.bot.stop('SIGTERM');
    }

    const token =
      this.configService.get<string>('NODE_ENV') === 'production'
        ? this.configService.get<string>('TELEGRAM_BOT_TOKEN')
        : this.configService.get<string>('TELEGRAM_BOT_TOKEN_TEST');

    if (!token) {
      this.logger.warn('No token provided; telegram bot will not start.');
      return;
    }

    this.bot = new Telegraf(token);
    this.bot.botInfo = await this.bot.telegram.getMe();

    this.bot.start(async (ctx) => {
      await ctx.reply('Welcome to Saturivia! Have fun!');
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply('Help information coming soon');
    });

    this.bot.command('question', async (ctx) => {
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      try {
        const existing: OngoingQuestion = await this.ongoingQuestionService.getGame(chatId);
        const existingQuestion = existing.questionId?.question ?? 'An active question is already running.';
        await ctx.reply(
          this.renderQuestionMessage(
            existingQuestion,
            'Question:',
            existing.questionId?.difficulty,
            existing.questionId?.category,
          ),
        );
        return;
      } catch (err) {
        console.error('Error checking existing game', err);
      }

      const game = await this.ongoingQuestionService.startNewGame(chatId);
      if (!game) {
        await ctx.reply('Could not start a new game.');
        return;
      }

      const question = game?.questionId?.question ?? 'No question available';
      await ctx.reply(
        this.renderQuestionMessage(
          question,
          'Question:',
          game?.questionId?.difficulty,
          game?.questionId?.category,
        ),
      );
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

    this.setBotCommands();

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
          const correctAnswer = game?.questionId?.answer ?? 'the answer';
          await ctx.reply(`🎉 Correct! The answer was: ${correctAnswer}.\nScore: +1`);
          await this.ongoingQuestionService.endCurrentGame(chatId);
        } else {
          const correctAnswer = game?.questionId?.answer ?? '';
          try {
            const givenLen = String(text).trim().length;
            const answerLen = String(correctAnswer).trim().length;
            if (givenLen > 0 && givenLen === answerLen) {
              const msgId = (ctx.message as any).message_id;
              try {
                if (this.bot && this.bot.telegram && typeof this.bot.telegram.setMessageReaction === 'function') {
                  await this.bot.telegram.setMessageReaction(chatId, msgId, [({ type: 'emoji', emoji: '❌' } as any)], false);
                }
              } catch (err) {
                this.logger.warn('Failed to set message reaction', err);
              }
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

  private async setBotCommands() {
    if (!this.bot) return;

    // Define all your commands here, matching your handlers
    const commands = [
      { command: 'help', description: 'How to play' },
      { command: 'question', description: 'Start a new trivia question' },
      { command: 'scoreboard', description: 'View the top 5 players' },
    ];

    try {
      await this.bot.telegram.setMyCommands(commands);
      this.logger.log('Bot commands successfully set via API.');
    } catch (error) {
      this.logger.error('Failed to set bot commands via API', error);
    }
  }

  async onModuleDestroy() {
    if (this.bot) {
      try {
        await this.bot.stop();
        this.logger.log('Telegram bot stopped');
      } catch (err) {
        // If bot wasn't running, stop() may throw 'Bot is not running!'
        const msg = err && (err as any).message ? String((err as any).message) : '';
        if (msg.includes('Bot is not running')) {
          this.logger.log('Telegram bot was not running during shutdown');
        } else {
          this.logger.error('Error while stopping Telegram bot', err);
        }
      }
    }
  }
}