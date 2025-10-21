import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { QuestionService } from 'src/question/question.service';
import { PlayerService } from 'src/player/player.service';
import { GameService } from 'src/game/game.service';
import { Game } from 'src/game/game.schema';
import { QUESTION_TYPE } from 'src/question/question-type';

interface BotCommand {
  command: string;
  description: string;
  action: (ctx: any) => Promise<void>;
}
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(
    private configService: ConfigService,
    private questionService: QuestionService,
    private playerService: PlayerService,
    @Inject(forwardRef(() => GameService)) private gameService: GameService,
  ) { }

  private readonly botCommands: BotCommand[] = [
    {
      command: 'help',
      description: 'How to play',
      action: async (ctx) => {
        await ctx.reply('Help information here');
      }
    },
    {
      command: 'scoreboard',
      description: 'View top score',
      action: async (ctx) => {
        const top = await this.playerService.getTopPlayers(5);
        if (!top || top.length === 0) {
          await ctx.reply('No scores yet. Play some games!');
          return;
        }
        const lines = top.map((t, i) => `${i + 1}. ${t.username ?? t.telegramId} — ${t.totalScore}`);
        await ctx.reply(['Top players:', ...lines].join('\n'));
      }
    },
    {
      command: QUESTION_TYPE.TRIVIA,
      description: 'Start a new trivia question',
      action: async (ctx) => {
        const chatId = ctx.chat?.id;
        const telegramMessageThreadId = ctx.message?.message_thread_id || null;

        if (!chatId) {
          this.logger.warn('No chatId in /trivia command');
          return;
        }

        let game: Game | null = null;
        try {
          game = await this.gameService.getGame(chatId, telegramMessageThreadId);
        } catch (err) {
          this.logger.error('Error checking existing game', err);
        }

        if (!game) {
          game = await this.gameService.startNewGame(chatId, telegramMessageThreadId);
          if (!game || !game.question?.question || !game.question?.answer) {
            await ctx.reply('Error: could not start a new game.');
            return;
          }
        }

        const question = game.question.question;
        const answer = game.question.answer;

        await ctx.reply(
          this.renderQuestionMessage(
            question,
            answer,
            game.question.difficulty,
            game.question.category,
          ),
        );
      }
    },
    {
      command: QUESTION_TYPE.CHGK,
      description: 'Start a new chgk question',
      action: async (ctx) => {
        const chatId = ctx.chat?.id;
        const messageId = ctx.message?.message_thread_id;

        if (!chatId) {
          this.logger.warn(`No chatId in /${QUESTION_TYPE.CHGK} command`);
          return;
        }

        await ctx.reply('CHGK questions are in development and will be available soon!');

      }
    }
  ];

  onModuleInit() {
    try {
      this.init();
    }
    catch (err) {
      this.logger.error('Failed to initialize Telegram bot', err);
    }
  }

  private getChatKind(ctx: any): { type?: string; isDM: boolean; isGroup: boolean; isChannel: boolean; isThread: boolean } {
    const type = ctx.chat?.type as string | undefined;
    const isDM = type === 'private';
    const isGroup = type === 'group' || type === 'supergroup';
    const isChannel = type === 'channel';
    // forum threads in supergroups include message_thread_id on the message
    const isThread = Boolean(ctx.message?.message_thread_id || ctx.message_thread_id);
    return { type, isDM, isGroup, isChannel, isThread };
  }

  private renderQuestionMessage(question: string, answer: string, difficulty: string | number, category?: string): string {
    let message = `${question}\n---\n`;
    if (category) {
      message += `category: ${category}\n`;
    }
    if (difficulty) {
      message += `difficulty: ${difficulty}\n`;
    }

    const wordCount = answer.trim().split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 1) {
      message += `words: ${wordCount}\n`;
    }

    const charCount = answer.replace(/\s/g, '').length;

    // move masking out of this function [hints will also be here]

    const questionMask = answer.replace(/[\p{L}\p{N}]/gu, '*');
    message += `hint: ${questionMask} [${charCount}]\n`;

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) {
      message += `debug: ${answer}\n`;
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

    this.setBotCommands();
    this.setBotTextActions();

    this.bot.launch()
      .then(() => this.logger.log('Telegram bot launched'))
      .catch((err) => this.logger.error('Failed to launch Telegram bot', err));
  }

  private getPlayAgainLink(type: QUESTION_TYPE): string {
    if (!type || !this.bot?.botInfo?.username) {
      return '';
    }

    return `/${type}@${this.bot?.botInfo?.username}`;
  }

  private setBotTextActions() {

    if (!this.bot) {
      this.logger.warn('Bot not initialized; cannot set text actions.');
      return;
    }

    this.bot.start(async (ctx) => {
      await ctx.reply('Welcome to Saturivia! Have fun!');
    });

    this.bot.on('message', async (ctx, next) => {
      const chatId = ctx.chat?.id;
      const telegramMessageThreadId = ctx.message?.message_thread_id;

      // only handle text messages
      if (!ctx.message || (ctx.message as any).text === undefined) {
        await next();
        return;
      }

      const text = (ctx.message as any).text as string;
      const { isDM } = this.getChatKind(ctx);

      //this.logger.debug(`Incoming text from chat ${chatId} type=${type} thread=${isThread}`);
      //this.logger.debug(`Text: ${text}`);

      if (!chatId || !ctx.from || !text || text.startsWith('/') || isDM || ctx.from.is_bot) {
        await next();
        return;
      }

      try {
        const game = await this.gameService.getGame(chatId, telegramMessageThreadId);

        if (!game) {
          return;
        }

        const isCorrect = await this.gameService.checkAnswer(
          chatId,
          telegramMessageThreadId,
          text,
          ctx.from.id,
          ctx.from.username
        );

        const correctAnswer = game?.question?.answer;

        if (isCorrect) {
          const score = this.gameService.getScoreFromStage(game.question.difficulty, game.stage);
          await ctx.reply(`🎉 Correct! Answer: ${correctAnswer}.\nScore: +${score}\n`);
          await this.gameService.endCurrentGame(chatId, telegramMessageThreadId);
        } else {
          try {
            // react to the message does not work; commenting out for now

            /* const givenLen = String(text).trim().length;
            const answerLen = String(correctAnswer).trim().length;
            if (givenLen > 0 && givenLen === answerLen) {
              const msgId = (ctx.message as any).message_thread_id;
              try {
                if (this.bot && this.bot.telegram && typeof this.bot.telegram.setMessageReaction === 'function') {
                  await this.bot.telegram.setMessageReaction(chatId, msgId, [({ type: 'emoji', emoji: '❌' } as any)], false);
                }
              } catch (err) {
                this.logger.warn('Failed to set message reaction', err);
              }
            } else {
              // ignore messages that are not the same length as the answer
            } */
          } catch (err) {
            this.logger.warn('Failed to react to message', err);
          }
        }
      } catch (err) {
        this.logger.error('Error processing text message', err);
      }
    });
  }

  private async setBotCommands() {

    if (!this.bot) {
      this.logger.warn('Bot not initialized; cannot set bot commands.');
      return;
    }

    try {
      await this.bot.telegram.setMyCommands(this.botCommands);
      this.botCommands.forEach(it => {
        this.bot?.command(it.command, (ctx) => {
          it.action(ctx);
        });
      });
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
        const msg = err && (err as any).message ? String((err as any).message) : '';
        if (msg.includes('Bot is not running')) {
          this.logger.log('Telegram bot was not running during shutdown');
        } else {
          this.logger.error('Error while stopping Telegram bot', err);
        }
      }
    }
  }

  async sendMessage(chatId: number, telegramMessageThreadId: number | undefined, text: string): Promise<void> {
    if (this.bot) {

      const extra = {
        parse_mode: 'HTML' as import('telegraf/types').ParseMode,
      }

      if (telegramMessageThreadId) {
        extra['reply_to_message_id'] = telegramMessageThreadId;
      }

      await this.bot.telegram.sendMessage(chatId, text, extra);

    } else {
      this.logger.warn('Bot not initialized. Cannot send message.');
    }
  }
}