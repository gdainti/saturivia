import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { QuestionService } from 'src/question/question.service';
import { PlayerService } from 'src/player/player.service';
import { GameService } from 'src/game/game.service';
import { Game } from 'src/game/game.schema';
import { QUESTION_TYPE } from 'src/question/question-type';
import { Message, ReactionType } from 'telegraf/types';
import { QuestionDocument } from 'src/question/question.schema';

// Possible reaction emojis:
// "👍" | "👎" | "❤" | "🔥" | "🥰" | "👏" | "😁" | "🤔" | "🤯" |
//  "😱" | "🤬" | "😢" | "🎉" | "🤩" | "🤮" | "💩" | "🙏" | "👌" |
// "🕊" | "🤡" | "🥱" | "🥴" | "😍" | "🐳" | "❤‍🔥" | "🌚" | "🌭" |
// "💯" | "🤣" | "⚡" | "🍌" | "🏆" | "💔" | "🤨" | "😐" | "🍓" |
// "🍾" | "💋" | "🖕" | "😈" | "😴" | "😭" | "🤓" | "👻" | "👨‍💻" |
// "👀" | "🎃" | "🙈" | "😇" | "😨" | "🤝" | "✍" | "🤗" | "🫡" |
// "🎅" | "🎄" | "☃" | "💅" | "🤪" | "🗿" | "🆒" | "💘" | "🙉" |
// "🦄" | "😘" | "💊" | "🙊" | "😎" | "👾" | "🤷‍♂" | "🤷" | "🤷‍♀" |
// "😡";

const WRONG_ANSWER_REACTIONS: ReactionType[] = [
  { type: 'emoji', emoji: '🤔' },
  { type: 'emoji', emoji: '😢' },
  { type: 'emoji', emoji: '🤷‍♂' },
  { type: 'emoji', emoji: '🤷' },
  { type: 'emoji', emoji: '🤷‍♀' },
  { type: 'emoji', emoji: '🤯' },
  { type: 'emoji', emoji: '🥴' },
  { type: 'emoji', emoji: '🙈' },
  { type: 'emoji', emoji: '🙊' },
  { type: 'emoji', emoji: '🗿' },
  { type: 'emoji', emoji: '😨' },
];

const CORRECT_ANSWER_REACTIONS: ReactionType[] = [
  { type: 'emoji', emoji: '🎉' },
  { type: 'emoji', emoji: '🏆' },
  { type: 'emoji', emoji: '🔥' },
  { type: 'emoji', emoji: '👏' },
  { type: 'emoji', emoji: '🍾' },
  { type: 'emoji', emoji: '💘' },
  { type: 'emoji', emoji: '😎' },
  { type: 'emoji', emoji: '🤝' },
];

const REPLY_MESSAGE = 'To submit your answer: reply or mention the bot or start your message with "="';

interface BotCommand {
  command: string;
  description: string;
  action: (ctx: any) => Promise<void>;
}

@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private isScriptMode: boolean = false;

  constructor(
    private configService: ConfigService,
    private questionService: QuestionService,
    private playerService: PlayerService,
    @Inject(forwardRef(() => GameService)) private gameService: GameService,
  ) {
    this.isScriptMode = !!process.env.SCRIPT_MODE;
  }

  private readonly botCommands: BotCommand[] = [
    {
      command: 'help',
      description: 'How to play',
      action: async (ctx) => {
        let helpMessage = `🤖<b>${this.bot?.botInfo?.username || 'Saturivia'} Bot Help</b> 🪐\n\n`;

        helpMessage += `Trigger /${QUESTION_TYPE.TRIVIA} command to start a ${QUESTION_TYPE.TRIVIA} question` + '\n';
        helpMessage += REPLY_MESSAGE + '\n';
        helpMessage += 'Incorrect answers or answers after hints reduce the points received' + '\n';
        helpMessage += '\n' + this.getJoinLinkMessage();

        await this.reply(ctx, helpMessage);
      }
    },
    {
      command: 'version',
      description: 'app package version',
      action: async (ctx) => {
        const version = process.env.npm_package_version ?? 'unknown';
        await this.reply(ctx, version);
      }
    },
    {
      command: 'stats',
      description: 'View game statistics',
      action: async (ctx) => {

        const top = await this.playerService.getTopPlayers(10);
        let topPlayersMessage = '';

        if (!top || top.length === 0) {
          topPlayersMessage += '🫙 No scores yet. Play some games!';
        } else {
          const lines = top.map((t, i) => `${i + 1}. ${t.username ?? t.telegramId}: <b>${t.totalScore}</b>`);
          topPlayersMessage += '🏆 <b>Leaderboard</b>\n';
          topPlayersMessage += lines.join('\n');
        }

        const totalQuestions = await this.questionService.getTotalQuestions();
        const totalPlayers = await this.playerService.getTotalPlayers();
        const totalGames = await this.questionService.getTotalHistoryQuestions();
        const totalWrongAnswers = await this.questionService.getTotalWrongAnswers();
        const totalCorrectAnswers = await this.questionService.getCorrectAnswersCount();

        // TODO make common function
        const answeredPercentage = (totalGames > 0)
          ? (totalCorrectAnswers / totalGames) * 100
          : 0;
        const AnsweredFormattedPercentage = answeredPercentage.toFixed(2);

        const unansweredPercentage = (totalGames > 0)
          ? ((totalGames - totalCorrectAnswers) / totalGames) * 100
          : 0;
        const unansweredFormattedPercentage = unansweredPercentage.toFixed(2);

        let statsMessage = '📊 <b>Total Stats</b>\n';
        statsMessage += `- total questions: <b>${totalQuestions}</b>\n`;
        statsMessage += `- total players: <b>${totalPlayers}</b>\n`;
        statsMessage += `- total questions played: <b>${totalGames}</b>\n`;
        statsMessage += `- total questions answered: <b>${totalCorrectAnswers}</b> [${AnsweredFormattedPercentage}%]\n`;
        statsMessage += `- total unanswered questions: <b>${totalGames - totalCorrectAnswers}</b> [${unansweredFormattedPercentage}%]\n`;
        statsMessage += `- total wrong answers: <b>${totalWrongAnswers}</b>\n`;


        let personalMessage = '';

        const player = await this.playerService.findPlayerByTelegramId(ctx.from.id);

        if (player) {
          personalMessage = `👤 <b>${player.username}</b>\n`;

          const playerCorrectAnswers = await this.questionService.getCorrectAnswersCount(String(player._id));
          const playerWrongAnswers = await this.questionService.getTotalWrongAnswers(String(player._id));

          personalMessage += `- questions answered: <b>${playerCorrectAnswers}</b>\n`;
          personalMessage += `- wrong answers: <b>${playerWrongAnswers}</b>\n`;
        }

        await this.reply(ctx, `${topPlayersMessage}\n\n---\n\n${statsMessage}\n---\n\n${personalMessage}`);
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

        if (game) {
          // ongoing game exists
          return;
        }

        const player = await this.playerService.findOrCreatePlayer(ctx.from.id, ctx.from.username);
        const triggeredPlayerId = String(player._id);

        game = await this.gameService.startNewGame(chatId, telegramMessageThreadId, QUESTION_TYPE.TRIVIA, triggeredPlayerId);
        if (!game || !game.question?.question || !game.question?.answer) {
          await this.reply(ctx, '❌ Error: could not start a new game.');
          return;
        }

        const question = game.question.question;
        const answer = game.question.answer;

        await this.reply(
          ctx,
          this.renderQuestionMessage(
            question,
            this.questionService.generateClue(game.question as QuestionDocument, game.stage),
            game.question.difficulty,
            game.question.category,
            game.question.answer
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

        await ctx.reply('🚧 CHGK questions are in development');

      }
    }
  ];

  private getJoinLinkMessage(): string {
    return `join <a href="https://t.me/+9sGPFwfhKmFjYmQy">Saturivia chat🪐</a> to play`;
  }

  onApplicationBootstrap() {

    if (this.isScriptMode) {
      this.logger.log('Script mode is enabled, skipping telegram service');
      return;
    }

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
    const isThread = Boolean(ctx.message?.message_thread_id || ctx.message_thread_id);
    return { type, isDM, isGroup, isChannel, isThread };
  }

  private renderDifficulty(difficulty: string | number): string {
    const level = Math.min(Math.max(Number(difficulty) || 0, 0), 3);
    const filled = '★'.repeat(level);
    const empty = '☆'.repeat(3 - level);
    return filled + empty;
  }


  public renderQuestion(question: string): string {
    const replacements: { [key: string]: string } = {
      'а': 'a',
      'е': 'e',
      'о': 'o',
      'с': 'c',
      'р': 'p',
    };

    let normalizedQuestion = question;

    for (const cyrillicChar in replacements) {
      if (replacements.hasOwnProperty(cyrillicChar)) {
        const latinChar = replacements[cyrillicChar];

        const regex = new RegExp(cyrillicChar, 'gi');

        normalizedQuestion = normalizedQuestion.replace(regex, (match) => {
          if (match === cyrillicChar.toUpperCase()) {
            return latinChar.toUpperCase();
          }
          return latinChar.toLowerCase();
        });
      }
    }

    return `❔<b>${normalizedQuestion}</b>\n\n`;
  }

  public renderClue(hint: string): string {
    const words = hint.split(/\s+/).filter(Boolean);
    const lengths = words.map(word => word.length);
    const lengthsString = lengths.join(' ');
    return `💡 <b>${hint}</b> <code>[${lengthsString}]</code>\n`;
  }

  public renderQuestionMessage(question: string, hint: string, difficulty: number, category?: string, debug?: string): string {

    let message = this.renderQuestion(question);

    message += this.renderClue(hint);
    message += '\n';

    const isDifficulty = difficulty && !isNaN(difficulty) && difficulty > 1;
    const isCategory = category && category.trim().length > 0;

    if (isDifficulty || isCategory) {
      message += '---\n';
    }

    if (isDifficulty) {
      message += `difficulty: ${this.renderDifficulty(difficulty)}\n`;
    }

    if (isCategory) {
      message += `category: ${category || '-'}\n`;
    }

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction && debug) {
      message += `debug: ${debug}\n`;
    }

    return message;
  }

  private async stopBot() {

    if (this.isScriptMode) {
      return;
    }

    if (this.bot) {
      await this.bot.stop('SIGINT');
      await this.bot.stop('SIGTERM');
      this.bot = null;
      this.logger.log('Telegram bot stopped.');
    }
  }

  public async revealAnswer(chatId: number, telegramMessageThreadId: number | undefined, question: QuestionDocument): Promise<void> {
    const randomReaction = WRONG_ANSWER_REACTIONS[Math.floor(Math.random() * CORRECT_ANSWER_REACTIONS.length)];
    const randomWrongEmoji = (randomReaction as { emoji: string }).emoji;
    await this.sendMessage(
      chatId,
      telegramMessageThreadId,
      `${randomWrongEmoji || '❄️'}Answer: <i>${question.answer}</i>\n${this.getPlayAgainLink(question.type)}\n\n`
    );
  }

  private async init() {

    if (this.bot) {
      await this.stopBot();
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

  private getPlayAgainLink(type: string): string {
    if (!type || !this.bot?.botInfo?.username) {
      return '';
    }
    return `\n🔄 /${type}@${this.bot?.botInfo?.username}`;
  }

  private wasBotMentioned(message: Message.TextMessage, botUsername: string | undefined): boolean {
    if (!message.text || !message.entities || !botUsername) {
      return false;
    }

    const targetMention = `@${botUsername}`;

    for (const entity of message.entities) {
      if (entity.type === 'mention') {
        const mentionedText = message.text.substring(entity.offset, entity.offset + entity.length);
        if (mentionedText.toLowerCase() === targetMention.toLowerCase()) {
          return true;
        }
      }
    }

    return false;
  }

  private getMessageForProcessing(ctx: any, text: string): string | null {
    const eqMatch = text.match(/^\s*=\s*(.*)/s);
    if (eqMatch) {
      return eqMatch[1].trim() || null;
    }

    const botUsername = this.bot?.botInfo?.username;
    const isReplyBot = (ctx.message as any).reply_to_message?.from?.is_bot;
    const wasBotRepliedTo = Boolean(isReplyBot && (ctx.message as any).reply_to_message?.from?.username === botUsername);
    const wasBotMentioned = botUsername ? this.wasBotMentioned(ctx.message as Message.TextMessage, botUsername) : false;
    const messageToProcess = this.trimBotMention(text, botUsername).trim() || null;

    if (wasBotRepliedTo || wasBotMentioned) {
      return messageToProcess || null;
    }

    return null;
  }

  private trimBotMention(text: string, botUsername: string | undefined): string {
    if (!botUsername) {
      return text;
    }
    const escapedUsername = botUsername.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const mentionRegex = new RegExp(`\s*@?${escapedUsername}[\\s,:]*`, 'gi');
    let result = text.replace(mentionRegex, ' ');
    result = result.replace(/\s+([!,.?;:])/g, '$1');
    result = result.replace(/\s+/g, ' ').trim();
    return result;
  }

  private setBotTextActions() {

    if (!this.bot) {
      this.logger.warn('Bot not initialized; cannot set text actions.');
      return;
    }

    this.bot.start(async (ctx) => {
      await this.reply(ctx, `Welcome to Saturivia🪐!\n ${this.getJoinLinkMessage()}`);
    });

    this.bot.on('message', async (ctx, next) => {
      const telegramChatId = ctx.chat?.id;
      const topicMessage = ctx.message?.is_topic_message;
      // telegramMessageThreadId needs to be filled only for topics, to distinguish threads and main chat
      const telegramMessageThreadId = topicMessage ? ctx.message?.message_thread_id : undefined;
      const replyToMessage = (ctx.message as any).reply_to_message;

      if (!ctx.message || (ctx.message as any).text === undefined) {
        await next();
        return;
      }

      const messageText = (ctx.message as any).text as string;
      const { isDM, type, isThread } = this.getChatKind(ctx);

      const isBot = ctx.from?.is_bot && ctx.from.username !== 'GroupAnonymousBot';

      if (!telegramChatId || !ctx.from || !messageText || messageText.startsWith('/') || isDM || isBot) {
        await next();
        return;
      }

      try {
        const game = await this.gameService.getGame(telegramChatId, telegramMessageThreadId || undefined);

        if (!game) {
          return;
        }

        const text = this.getMessageForProcessing(ctx, messageText);

        const isCorrectMessageText = await this.gameService.checkAnswer(
          game,
          messageText,
          telegramChatId,
          telegramMessageThreadId,
        );

        if (isCorrectMessageText && !text) {
          await this.reply(ctx, `🚫${REPLY_MESSAGE}`);
          return;
        }

        if (!text) {
          await next();
          return;
        }

        const originalAnswer = game?.question?.answer;

        // checking trimmed valid answer
        const isCorrect = await this.gameService.checkAnswer(
          game,
          text,
          telegramChatId,
          telegramMessageThreadId,
        );

        // since it is 'official' answer, can record the player right away
        const player = await this.playerService.findOrCreatePlayer(ctx.from.id, ctx.from.username);

        if (isCorrect) {

          const wrongAnswers = await this.questionService.getIncorrectAnswersForQuestion(
            telegramChatId,
            telegramMessageThreadId,
            String((game.question as QuestionDocument)._id),
            String(player._id),
          );

          const score = this.gameService.getScoreFromStage(game.question.difficulty, game.stage, wrongAnswers);
          const randomReaction = CORRECT_ANSWER_REACTIONS[Math.floor(Math.random() * CORRECT_ANSWER_REACTIONS.length)];
          this.bot?.telegram.setMessageReaction(telegramChatId, ctx.message.message_id, [randomReaction]);
          const mentionUser = this.mentionUserByTelegramId(ctx.from.id, ctx.from.username);
          await this.reply(ctx, `${(randomReaction as { emoji: string }).emoji} <i>${originalAnswer}</i>\n\n---\n${mentionUser}: +${score} points\n${this.getPlayAgainLink(game.question.type)}`);
          await this.gameService.endCurrentGame(
            telegramChatId,
            telegramMessageThreadId,
            String((game.question as QuestionDocument)._id),
            score,
            String(player._id),
            String(game.triggeredPlayerId),
            game.stage
          );
          // TODO show scoreboard if player entered scoreboard

        } else {
          // incorrect answer

          this.questionService.saveIncorrectAnswer(
            telegramChatId,
            telegramMessageThreadId,
            String((game.question as QuestionDocument)._id),
            String(player._id),
            text
          );

          //if (originalAnswer.length === text.length) {}
          const randomReaction = WRONG_ANSWER_REACTIONS[Math.floor(Math.random() * WRONG_ANSWER_REACTIONS.length)];
          this.bot?.telegram.setMessageReaction(telegramChatId, ctx.message.message_id, [randomReaction]);
        }
      } catch (err) {
        this.logger.error('Error processing text message', err);
      }
    });
  }

  public mentionUserByTelegramId(id: string | number, name: string | undefined) {
    if (!id) {
      return name || 'Player';
    }

    const mention = id.toString().startsWith('@') ? id : `<a href="tg://user?id=${id}">${name}</a>`;
    return `${mention}`;
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
        await this.stopBot();
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

  private getDefaultExtra() {
    return ({
      parse_mode: 'HTML' as import('telegraf/types').ParseMode,
    });
  }

  private async reply(ctx: Context, text: string): Promise<void> {
    const extra = this.getDefaultExtra();
    await ctx.reply(text, extra);
  }

  async sendMessage(chatId: number, telegramMessageThreadId: number | undefined, text: string): Promise<void> {
    if (this.bot) {

      const extra = this.getDefaultExtra();

      if (telegramMessageThreadId) {
        extra['reply_to_message_id'] = telegramMessageThreadId;
      }

      await this.bot.telegram.sendMessage(chatId, text, extra);

    } else {
      this.logger.warn('Bot not initialized. Cannot send message.');
    }
  }
}