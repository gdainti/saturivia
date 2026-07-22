import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { TelegramError } from 'telegraf';
import { Model } from 'mongoose';
import { TelegramService } from 'src/telegram/telegram.service';
import { ChGKFetcherService } from './chgk-fetcher.service';
import { ChGKPost, ChGKPostDocument } from './chgk-post.schema';

// ── ChGK timing configuration ────────────────────────────────────────────────
// How often to post a new question in production (cron expression, Moscow time)
const QUESTION_CRON = '0 */4 * * *'; // every 4 hours

// How long to wait before revealing the answer in production
const PROD_ANSWER_DELAY_MS = 12 * 60 * 60 * 1000; // 12 hours

// Dev overrides (keep short for testing)
const DEV_ANSWER_DELAY_MS = 2 * 60 * 1000; // 2 minutes
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ChGKService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChGKService.name);
  private readonly channelId: string;
  private readonly channelChatId: string;
  private readonly triviaChatId: string;
  private readonly isProduction: boolean;
  private readonly adminTelegramId: number | undefined;

  constructor(
    private configService: ConfigService,
    private telegramService: TelegramService,
    private fetcherService: ChGKFetcherService,
    @InjectModel(ChGKPost.name) private chgkPostModel: Model<ChGKPostDocument>,
  ) {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.channelId = this.isProduction
      ? (this.configService.get<string>('CHGK_CHANNEL_ID') ?? '')
      : (this.configService.get<string>('CHGK_CHANNEL_TEST_ID') ?? '');
    this.channelChatId = this.isProduction
      ? (this.configService.get<string>('CHGK_CHANNEL_CHAT_ID') ?? '')
      : (this.configService.get<string>('CHGK_CHANNEL_CHAT_TEST_ID') ?? '');
    this.triviaChatId = this.configService.get<string>('SATURIVIA_TRIVIA_CHAT_ID') ?? '';
    const rawAdminId = this.configService.get<string>('ADMIN_TELEGRAM_ID');
    this.adminTelegramId = rawAdminId ? parseInt(rawAdminId, 10) : undefined;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.telegramService.registerAutoForwardListener(
      this.channelId,
      (channelMsgId, discussionMsgId) =>
        this.handleAutoForward(channelMsgId, discussionMsgId),
    );

    this.telegramService.registerBotCommand(
      'chgk_new',
      'Post a new ChGK question now',
      async (ctx) => {
        await ctx.reply('Fetching new ChGK question…');
        await this.postDailyQuestion();
      },
      { privateOnly: true, allowedUserId: this.adminTelegramId },
    );

    this.telegramService.registerBotCommand(
      'chgk_answer',
      'Post the answer for the oldest unanswered ChGK question',
      async (ctx) => {
        await ctx.reply('Posting oldest pending ChGK answer…');
        await this.forcePostOldestPendingAnswer();
      },
      { privateOnly: true, allowedUserId: this.adminTelegramId },
    );

  }

  @Cron(QUESTION_CRON, { timeZone: 'Europe/Moscow' })
  async handleDailyPost(): Promise<void> {
    if (this.isProduction) {
      await this.postDailyQuestion();
    }
  }

  @Cron('5 * * * *')
  async checkPendingAnswers(): Promise<void> {
    const pending = await this.chgkPostModel.find({
      answerScheduledFor: { $lte: new Date() },
      answerPostedAt: null,
      discussionMessageId: { $ne: null },
    });

    for (const post of pending) {
      await this.postAnswer(post);
    }
  }

  private async forcePostOldestPendingAnswer(): Promise<void> {
    const post = await this.chgkPostModel
      .findOne({ answerPostedAt: null })
      .sort({ answerScheduledFor: 1 });
    if (!post) return;
    await this.postAnswer(post);
  }

  private async postDailyQuestion(): Promise<void> {
    if (!this.channelId) {
      this.logger.warn('Channel ID not set, skipping');
      return;
    }

    const parsed = await this.fetcherService.fetchQuestion();
    if (!parsed) return;

    const answerDelay = this.isProduction ? PROD_ANSWER_DELAY_MS : DEV_ANSWER_DELAY_MS;
    const post = await this.chgkPostModel.create({
      ...parsed,
      channelMessageId: null,
      discussionMessageId: null,
      answerScheduledFor: new Date(Date.now() + answerDelay),
      answerPostedAt: null,
    });

    try {
      const messageId = await this.telegramService.sendChannelPost(
        this.channelId,
        this.formatQuestion(parsed.question),
      );
      post.channelMessageId = messageId;
      await post.save();
      this.logger.log(`Posted ChGK question, channel message_id=${messageId}`);

      if (this.isProduction && this.triviaChatId) {
        try {
          await this.telegramService.forwardMessage(this.triviaChatId, this.channelId, messageId);
        } catch (err) {
          this.logger.error(`Failed to forward question to trivia chat: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to post question: ${(err as Error).message}`);
    }
  }

  private async handleAutoForward(
    channelMsgId: number,
    discussionMsgId: number,
  ): Promise<void> {
    const post = await this.chgkPostModel.findOne({
      channelMessageId: channelMsgId,
      discussionMessageId: null,
    });
    if (!post) return;

    post.discussionMessageId = discussionMsgId;
    await post.save();
    this.logger.log(
      `Linked channel msg ${channelMsgId} → discussion msg ${discussionMsgId}`,
    );

    if (post.answerScheduledFor <= new Date() && !post.answerPostedAt) {
      await this.postAnswer(post);
    }
  }

  private async postAnswer(post: ChGKPostDocument): Promise<void> {
    if (!this.channelChatId || post.discussionMessageId === null) return;

    try {
      await this.telegramService.sendDiscussionReply(
        this.channelChatId,
        post.discussionMessageId,
        this.formatAnswer(post),
      );
      post.answerPostedAt = new Date();
      await post.save();
      this.logger.log(`Posted answer for ChGK post ${post._id}`);
    } catch (err) {
      if (err instanceof TelegramError && /repl/i.test(err.description) && /not found/i.test(err.description)) {
        post.answerPostedAt = new Date();
        await post.save();
        this.logger.warn(
          `Discussion message for ChGK post ${post._id} was deleted; marking answer as posted without sending it`,
        );
        return;
      }
      this.logger.error(`Failed to post answer: ${(err as Error).message}`);
    }
  }

  private formatQuestion(question: string): string {
    return `❔<b>Внимание, вопрос:</b>\n\n${question}\n`;
  }

  private formatAnswer(post: ChGKPostDocument): string {
    return `✅ <b>Внимание, правильный ответ:</b>\n\n<tg-spoiler>${post.answer}</tg-spoiler>`;
  }
}
