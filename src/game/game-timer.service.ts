import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument, GAME_STAGE } from 'src/game/game.schema';
import { QuestionDocument } from 'src/question/question.schema';
import { getTimingForStage } from './game-timer.config';
import { PlayerService } from '../player/player.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { GameService } from './game.service';
import { QUESTION_TYPE } from 'src/question/question-type';

interface GameTimer {
  timer: NodeJS.Timeout;
  gameId: string;
  expectedStage: GAME_STAGE;
  createdAt: Date;
}

@Injectable()
export class GameTimerService implements OnModuleInit {
  private readonly logger = new Logger(GameTimerService.name);
  private readonly activeTimers = new Map<string, GameTimer>();

  constructor(
    @InjectModel(Game.name) private gameModel: Model<GameDocument>,
    @Inject(forwardRef(() => GameService)) private gameService: GameService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'GameTimerService initialized, advancing any ongoing games...',
    );
    await this.advanceOngoingGamesOnStartup();
  }

  async startTimer(
    chatId: number,
    telegramMessageThreadId: number | undefined,
    questionType: string,
    currentStage: GAME_STAGE,
    triggeredPlayerId: string,
  ): Promise<void> {
    const gameKey = `${chatId}_${telegramMessageThreadId}`;

    await this.clearAllTimersForGame(chatId, telegramMessageThreadId);

    const nextStage = this.getNextStage(currentStage);
    if (!nextStage) {
      this.logger.log(`No next stage for ${currentStage}, game should end`);
      return;
    }

    const delaySeconds = getTimingForStage(questionType, nextStage);
    if (delaySeconds === 0) {
      this.logger.log(
        `No timing configured for stage ${nextStage}, ending game`,
      );
      await this.endGame(chatId, telegramMessageThreadId);
      return;
    }

    const game = await this.gameModel
      .findOne({
        telegramChatId: chatId,
        telegramMessageThreadId: telegramMessageThreadId,
        isDeleted: false,
      })
      .exec();

    if (!game) {
      this.logger.log(`Game ${gameKey} not found, cannot set timer`);
      return;
    }

    const gameId = (game._id as any).toString();
    this.logger.log(
      `Setting timer for ${gameKey} to advance to ${nextStage} in ${delaySeconds} seconds`,
    );

    const timer = setTimeout(async () => {
      try {
        await this.advanceGameWithValidation(
          chatId,
          telegramMessageThreadId,
          nextStage,
          triggeredPlayerId,
          gameId,
          currentStage,
        );
      } catch (error) {
        this.logger.error(`Error advancing game ${gameKey}:`, error);
      } finally {
        this.activeTimers.delete(gameKey);
      }
    }, delaySeconds * 1000);

    const gameTimer: GameTimer = {
      timer,
      gameId: gameId,
      expectedStage: currentStage,
      createdAt: new Date(),
    };

    this.activeTimers.set(gameKey, gameTimer);
  }

  private async clearAllTimersForGame(
    chatId: number,
    telegramMessageThreadId: number | undefined,
  ): Promise<void> {
    const prefix = `${chatId}_${telegramMessageThreadId}`;

    for (const [key, gameTimer] of this.activeTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(gameTimer.timer);
        this.activeTimers.delete(key);
        this.logger.log(`Cleared timer ${key} during clearAllTimersForGame`);
      }
    }
  }

  async stopTimer(
    chatId: number,
    telegramMessageThreadId: number | undefined,
  ): Promise<void> {
    await this.clearAllTimersForGame(chatId, telegramMessageThreadId);
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

  private async advanceGameWithValidation(
    chatId: number,
    telegramMessageThreadId: number | undefined,
    newStage: GAME_STAGE,
    triggeredPlayerId: string,
    expectedGameId: string,
    expectedCurrentStage: GAME_STAGE,
  ): Promise<void> {
    const currentGame = await this.gameModel
      .findOne({
        telegramChatId: chatId,
        telegramMessageThreadId: telegramMessageThreadId,
        isDeleted: false,
        _id: expectedGameId,
        stage: expectedCurrentStage,
      })
      .exec();

    if (!currentGame) {
      this.logger.log(
        `Game validation failed for ${chatId}_${telegramMessageThreadId}. Game may have ended or moved to different stage.`,
      );
      return;
    }

    const question: QuestionDocument | null =
      await this.gameService.advanceGame(
        chatId,
        telegramMessageThreadId,
        newStage,
      );

    if (!question) {
      this.logger.error(
        `Cannot advance game, question not found for ${chatId}_${telegramMessageThreadId}`,
      );
      return;
    }

    if (newStage === GAME_STAGE.CLUE_2) {
      const resultTimeoutMs = getTimingForStage(question.type, 'RESULT') * 1000;
      const revealTimer = setTimeout(async () => {
        try {
          const gameStillExists = await this.gameModel
            .findOne({
              telegramChatId: chatId,
              telegramMessageThreadId: telegramMessageThreadId,
              isDeleted: false,
              _id: expectedGameId,
            })
            .exec();

          if (!gameStillExists) {
            this.logger.log(
              `Game ${chatId}_${telegramMessageThreadId} no longer exists, skipping reveal`,
            );
            return;
          }

          await this.stopTimer(chatId, telegramMessageThreadId);
          await this.gameService.revealAnswer(
            chatId,
            telegramMessageThreadId,
            question,
          );
          await this.gameService.endCurrentGame(
            chatId,
            telegramMessageThreadId,
            String(question._id),
            0,
            null,
            triggeredPlayerId,
            newStage,
          );
        } catch (err) {
          this.logger.error(
            `Error revealing answer for ${chatId}_${telegramMessageThreadId}:`,
            err,
          );
        } finally {
          this.activeTimers.delete(`${chatId}_${telegramMessageThreadId}_end`);
        }
      }, resultTimeoutMs);

      const endTimer: GameTimer = {
        timer: revealTimer,
        gameId: expectedGameId,
        expectedStage: newStage,
        createdAt: new Date(),
      };

      this.activeTimers.set(
        `${chatId}_${telegramMessageThreadId}_end`,
        endTimer,
      );
    } else {
      await this.startTimer(
        chatId,
        telegramMessageThreadId,
        question.type,
        newStage,
        triggeredPlayerId,
      );
    }
  }

  private async advanceGame(
    chatId: number,
    telegramMessageThreadId: number | undefined,
    newStage: GAME_STAGE,
    triggeredPlayerId: string,
  ): Promise<void> {
    // Legacy method for backward compatibility - now uses validation
    const game = await this.gameModel
      .findOne({
        telegramChatId: chatId,
        telegramMessageThreadId: telegramMessageThreadId,
        isDeleted: false,
      })
      .exec();

    if (!game) {
      this.logger.log(
        `Game ${chatId}_${telegramMessageThreadId} not found for legacy advance`,
      );
      return;
    }

    await this.advanceGameWithValidation(
      chatId,
      telegramMessageThreadId,
      newStage,
      triggeredPlayerId,
      (game._id as any).toString(),
      game.stage,
    );
  }

  async endGame(
    telegramChatId: number,
    telegramMessageThreadId: number | undefined,
  ): Promise<void> {
    try {
      const game = await this.gameModel
        .findOne({
          telegramChatId: telegramChatId,
          telegramMessageThreadId: telegramMessageThreadId,
          isDeleted: false,
        })
        .populate('question')
        .exec();

      if (!game) {
        this.logger.log(
          `Game ${telegramChatId}_${telegramMessageThreadId} not found for ending`,
        );
        return;
      }

      await this.clearAllTimersForGame(telegramChatId, telegramMessageThreadId);

      await this.gameModel
        .deleteOne({
          telegramChatId: telegramChatId,
          telegramMessageThreadId: telegramMessageThreadId,
        })
        .exec();

      this.logger.log(
        `Game ${telegramChatId}_${telegramMessageThreadId} ended due to timeout`,
      );
    } catch (error) {
      this.logger.error(
        `Error ending game ${telegramChatId}_${telegramMessageThreadId}:`,
        error,
      );
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

      this.logger.log(
        `Found ${ongoingGames.length} ongoing games on startup, advancing them...`,
      );

      for (const game of ongoingGames) {
        const gameKey = `${game.telegramChatId}_${game.telegramMessageThreadId}`;

        if (game.stage === GAME_STAGE.RESULT) {
          this.logger.log(
            `Revealing answer for final stage game ${gameKey} on startup`,
          );
          const questionDoc = game.question as QuestionDocument;
          await this.stopTimer(
            game.telegramChatId,
            game.telegramMessageThreadId,
          );
          await this.gameService.revealAnswer(
            game.telegramChatId,
            game.telegramMessageThreadId,
            questionDoc,
          );
          await this.gameService.endCurrentGame(
            game.telegramChatId,
            game.telegramMessageThreadId,
            String(questionDoc._id),
            0,
            null,
            String(game.triggeredPlayerId),
            game.stage,
          );
          continue;
        }

        const nextStage = this.getNextStage(game.stage);
        if (nextStage) {
          this.logger.log(
            `Advancing game ${gameKey} from ${game.stage} to ${nextStage} on startup`,
          );
          await this.advanceGame(
            game.telegramChatId,
            game.telegramMessageThreadId,
            nextStage,
            String(game.triggeredPlayerId),
          );
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

  getActiveTimerInfo(): Array<{
    key: string;
    gameId: string;
    expectedStage: GAME_STAGE;
    createdAt: Date;
  }> {
    return Array.from(this.activeTimers.entries()).map(([key, timer]) => ({
      key,
      gameId: timer.gameId,
      expectedStage: timer.expectedStage,
      createdAt: timer.createdAt,
    }));
  }

  async cleanupOrphanedTimers(): Promise<void> {
    const timerEntries = Array.from(this.activeTimers.entries());
    let cleanedCount = 0;

    for (const [key, gameTimer] of timerEntries) {
      try {
        const gameExists = await this.gameModel
          .findOne({
            _id: gameTimer.gameId,
            isDeleted: false,
          })
          .exec();

        if (!gameExists) {
          clearTimeout(gameTimer.timer);
          this.activeTimers.delete(key);
          cleanedCount++;
          this.logger.log(
            `Cleaned up orphaned timer ${key} for non-existent game ${gameTimer.gameId}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error checking game existence for timer ${key}:`,
          error,
        );
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} orphaned timers`);
    }
  }
}
