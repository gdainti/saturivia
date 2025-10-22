import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument, GAME_STAGE } from 'src/game/game.schema';
import { QuestionDocument } from 'src/question/question.schema';
import { getTimingForStage } from './game-timer.config';
import { PlayerService } from '../player/player.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { GameService } from './game.service';

@Injectable()
export class GameTimerService implements OnModuleInit {
  private readonly logger = new Logger(GameTimerService.name);
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(Game.name) private gameModel: Model<GameDocument>,
    @Inject(forwardRef(() => GameService)) private gameService: GameService,
  ) { }

  async onModuleInit() {
    this.logger.log('GameTimerService initialized, advancing any ongoing games...');
    await this.advanceOngoingGamesOnStartup();
  }

  async startTimer(chatId: number, telegramMessageThreadId: number | undefined, questionType: string, currentStage: GAME_STAGE): Promise<void> {
    const gameKey = `${chatId}_${telegramMessageThreadId}`;

    this.clearTimer(gameKey);

    const nextStage = this.getNextStage(currentStage);
    if (!nextStage) {
      this.logger.log(`No next stage for ${currentStage}, game should end`);
      return;
    }

    const delaySeconds = getTimingForStage(questionType, nextStage);
    if (delaySeconds === 0) {
      this.logger.log(`No timing configured for stage ${nextStage}, ending game`);
      await this.endGame(chatId, telegramMessageThreadId);
      return;
    }

    this.logger.log(`Setting timer for ${gameKey} to advance to ${nextStage} in ${delaySeconds} seconds`);

    const timer = setTimeout(async () => {
      try {
        await this.advanceGame(chatId, telegramMessageThreadId, nextStage);
        this.activeTimers.delete(gameKey);
      } catch (error) {
        this.logger.error(`Error advancing game ${gameKey}:`, error);
        this.activeTimers.delete(gameKey);
      }
    }, delaySeconds * 1000);

    this.activeTimers.set(gameKey, timer);
  }

  private clearTimer(gameKey: string): void {
    const existingTimer = this.activeTimers.get(gameKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(gameKey);
    }
  }


  async stopTimer(chatId: number, telegramMessageThreadId: number | undefined): Promise<void> {
    const prefix = `${chatId}_${telegramMessageThreadId}`;
    // Clear any timers for this game (including stage and end timers)
    for (const [key, timer] of this.activeTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.activeTimers.delete(key);
        this.logger.log(`Cleared timer ${key} on stopTimer`);
      }
    }
  }

  private getNextStage(currentStage: GAME_STAGE): GAME_STAGE | null {
    switch (currentStage) {
      case GAME_STAGE.CLUE_0:
        return GAME_STAGE.CLUE_1;
      case GAME_STAGE.CLUE_1:
        return GAME_STAGE.CLUE_2;
      case GAME_STAGE.CLUE_2:
        return null;
      default:
        return null;
    }
  }

  private async advanceGame(chatId: number, telegramMessageThreadId: number | undefined, newStage: GAME_STAGE): Promise<void> {

    const question: QuestionDocument | null = await this.gameService.advanceGame(chatId, telegramMessageThreadId, newStage);

    if (!question) {
      this.logger.error(`Cannot set timer, question not found for ${chatId}_${telegramMessageThreadId}`);
      return;
    }

    if (newStage === GAME_STAGE.CLUE_2) {
      const resultTimeoutMs = getTimingForStage(question.type, 'RESULT') * 1000;
      const revealTimer = setTimeout(async () => {
        try {
          await this.stopTimer(chatId, telegramMessageThreadId);
          await this.gameService.revealAnswer(chatId, telegramMessageThreadId, question);
          await this.gameService.endCurrentGame(chatId, telegramMessageThreadId, String(question._id), 0, null);
        } catch (err) {
          this.logger.error(`Error revealing answer for ${chatId}_${telegramMessageThreadId}:`, err);
        }
      }, resultTimeoutMs);

      this.activeTimers.set(`${chatId}_${telegramMessageThreadId}_end`, revealTimer);
    } else {
      await this.startTimer(chatId, telegramMessageThreadId, question.type, newStage);
    }
  }

  async endGame(chatId: number, telegramMessageThreadId: number | undefined): Promise<void> {
    try {
      const game = await this.gameModel
        .findOne({
          telegramChatId: chatId,
          telegramMessageThreadId: telegramMessageThreadId,
          isDeleted: false
        })
        .populate('question')
        .exec();

      if (!game) {
        this.logger.log(`Game ${chatId}_${telegramMessageThreadId} not found for ending`);
        return;
      }

      await this.stopTimer(chatId, telegramMessageThreadId);
      const endTimerKey = `${chatId}_${telegramMessageThreadId}_end`;
      this.clearTimer(endTimerKey);

      this.logger.log(`Game ${chatId}_${telegramMessageThreadId} ended due to timeout`);
    } catch (error) {
      this.logger.error(`Error ending game ${chatId}_${telegramMessageThreadId}:`, error);
    }
  }

  async advanceOngoingGamesOnStartup(): Promise<void> {
    try {
      const ongoingGames = await this.gameModel
        .find({
          isDeleted: false,
        })
        .populate('question')
        .exec();

      if (ongoingGames.length === 0) {
        this.logger.log('No ongoing games found on startup');
        return;
      }

      this.logger.log(`Found ${ongoingGames.length} ongoing games on startup, advancing them...`);

      for (const game of ongoingGames) {
        const gameKey = `${game.telegramChatId}_${game.telegramMessageThreadId}`;

        if (game.stage === GAME_STAGE.REVEAL) {
          this.logger.log(`Revealing answer for final stage game ${gameKey} on startup`);
          const questionDoc = game.question as QuestionDocument;
          await this.stopTimer(game.telegramChatId, game.telegramMessageThreadId);
          await this.gameService.revealAnswer(game.telegramChatId, game.telegramMessageThreadId, questionDoc);
          await this.gameService.endCurrentGame(game.telegramChatId, game.telegramMessageThreadId, String(questionDoc._id), 0, null);
          continue;
        }

        const nextStage = this.getNextStage(game.stage);
        if (nextStage) {
          this.logger.log(`Advancing game ${gameKey} from ${game.stage} to ${nextStage} on startup`);
          await this.advanceGame(game.telegramChatId, game.telegramMessageThreadId, nextStage);
        } else {
          this.logger.log(`Ending game ${gameKey} (no next stage) on startup`);
          await this.endGame(game.telegramChatId, game.telegramMessageThreadId);
        }
      }

    } catch (error) {
      this.logger.error('Error in advanceOngoingGamesOnStartup:', error);
    }
  }

  getActiveTimerCount(): number {
    return this.activeTimers.size;
  }

  getActiveTimerKeys(): string[] {
    return Array.from(this.activeTimers.keys());
  }
}