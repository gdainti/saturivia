import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument, GAME_STAGE } from 'src/game/game.schema';
import { QuestionDocument } from 'src/question/question.schema';
import { getTimingForStage } from './game-timer.config';
import { PlayerService } from '../player/player.service';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class GameTimerService implements OnModuleInit {
  private readonly logger = new Logger(GameTimerService.name);
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(Game.name) private gameModel: Model<GameDocument>,
    private playerService: PlayerService,
    @Inject(forwardRef(() => TelegramService)) private telegramService: TelegramService,
  ) {}

  async onModuleInit() {
    this.logger.log('GameTimerService initialized, advancing any ongoing games...');
    await this.advanceOngoingGamesOnStartup();
  }  async startTimer(chatId: number, telegramMessageThreadId: number | undefined, questionType: string, currentStage: GAME_STAGE): Promise<void> {
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
        this.logger.log(`Game ${chatId}_${telegramMessageThreadId} not found, may have been ended already`);
        return;
      }

      const question = game.question as QuestionDocument;
      const clue = this.generateClue(question, newStage);

      // Update game stage and clue
      await this.gameModel.updateOne(
        { telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId },
        {
          $set: {
            stage: newStage,
            clue,
            lastClueAt: new Date()
          }
        }
      );

      this.logger.log(`Advanced game ${chatId}_${telegramMessageThreadId} to ${newStage}`);

      // Notify chat of new clue
      await this.telegramService.sendMessage(chatId, telegramMessageThreadId, `Clue: ${clue}`);

      // Start timer for next stage or reveal
      if (newStage === GAME_STAGE.CLUE_2) {
        // Last clue, schedule reveal answer using configurable result timeout
        const resultTimeoutMs = getTimingForStage(question.type, 'RESULT') * 1000;
        const revealTimer = setTimeout(async () => {
          try {
            await this.revealAnswer(chatId, telegramMessageThreadId);
          } catch (err) {
            this.logger.error(`Error revealing answer for ${chatId}_${telegramMessageThreadId}:`, err);
          }
        }, resultTimeoutMs);

        this.activeTimers.set(`${chatId}_${telegramMessageThreadId}_end`, revealTimer);
      } else {
        await this.startTimer(chatId, telegramMessageThreadId, question.type, newStage);
      }

      // TODO: Emit event or call telegram service to send clue to chat

    } catch (error) {
      this.logger.error(`Error advancing game ${chatId}_${telegramMessageThreadId}:`, error);
    }
  }

  private generateClue(question: QuestionDocument, stage: GAME_STAGE): string {
    // If question has a hint and it's the first clue, use the hint
    if (stage === GAME_STAGE.CLUE_1 && question.hint) {
      return question.hint;
    }

    // For other stages or if no hint, generate masked answer clue
    return this.generateMaskedAnswerClue(question.answer, stage);
  }

  private generateMaskedAnswerClue(answer: string, stage: GAME_STAGE): string {
    // 1. Initial setup and normalization
    const nonSpaceAnswer = answer.replace(/\s/g, '');
    const totalChars = nonSpaceAnswer.length;

    // Return empty string if the answer has no revealable characters
    if (totalChars === 0) {
        return '';
    }

    // 2. Determine percentage based on stage
    let revealPercentage: number;
    switch (stage) {
        case GAME_STAGE.CLUE_1:
            revealPercentage = 0.3; // 30% reveal, guaranteeing the first letter.
            break;
        case GAME_STAGE.CLUE_2:
            revealPercentage = 0.6; // 60% reveal, scattered.
            break;
        default:
            // For any other stage, return a fully masked answer (or fully revealed if RESULT, but
            // the caller should handle RESULT separately)
            return answer.replace(/[a-zA-Z0-9]/g, '_');
    }

    // 3. Calculate characters to reveal
    // Use Math.min(totalChars, ...) to prevent revealing more than 100%
    // Use Math.max(1, ...) to ensure at least one character is revealed if percentage > 0
    const charsToReveal = Math.min(
        totalChars,
        Math.max(1, Math.floor(totalChars * revealPercentage))
    );

    // 4. Select random, unique indices to reveal
    const indicesToReveal = new Set<number>();

    // GUARANTEE: Always reveal the first character (index 0 of the non-space string)
    // This addresses the user request for "1st symbol" to guarantee a hint.
    if (charsToReveal > 0) {
        indicesToReveal.add(0);
    }

    // Add remaining random, unique indices until the target count is met
    while (indicesToReveal.size < charsToReveal) {
        const randomIndex = Math.floor(Math.random() * totalChars);
        indicesToReveal.add(randomIndex);
    }

    // 5. Rebuild the masked string by iterating over the original answer
    let maskedAnswer = '';
    let nonSpaceIndex = 0;

    for (const char of answer) {
        if (char === ' ') {
            maskedAnswer += ' ';
            // Spaces are preserved and do not consume a nonSpaceIndex slot
        } else {
            // Check if the current non-space character's index is in our reveal set
            if (indicesToReveal.has(nonSpaceIndex)) {
                maskedAnswer += char; // Keep the character
            } else {
                maskedAnswer += '*';  // Mask with an underscore
            }
            // Move to the next non-space character index
            nonSpaceIndex++;
        }
    }

    return maskedAnswer;
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

      const question = game.question as any;
      if (question?._id) {
        await this.playerService.recordUnansweredQuestion(question._id.toString());
      }

      // Mark game as deleted (soft delete)
      await this.gameModel.updateOne(
        { telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId },
        {
          $set: {
            isDeleted: true,
            stage: GAME_STAGE.REVEAL
          }
        }
      );

      // TODO: Emit event or call telegram service to notify chat that game ended

      this.logger.log(`Game ${chatId}_${telegramMessageThreadId} ended due to timeout`);
    } catch (error) {
      this.logger.error(`Error ending game ${chatId}_${telegramMessageThreadId}:`, error);
    }
  }

  // New method to transition game to ANSWER_REVEALED stage without deleting
  private async revealAnswer(chatId: number, telegramMessageThreadId: number | undefined): Promise<void> {
    const game = await this.gameModel
      .findOne({ telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId, isDeleted: false })
      .populate('question')
      .exec();
    if (!game) {
      this.logger.log(`Game ${chatId}_${telegramMessageThreadId} not found for revealing`);
      return;
    }

    const question = game.question as QuestionDocument;
    // Update stage to reveal and set clue to full answer
    await this.gameModel.updateOne(
      { telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId },
      {
        $set: {
          stage: GAME_STAGE.REVEAL,
          clue: question.answer,
          lastClueAt: new Date(),
        }
      }
    );

    this.logger.log(`Revealed answer for game ${chatId}_${telegramMessageThreadId}`);
    // Notify chat of answer
    await this.telegramService.sendMessage(chatId, telegramMessageThreadId, `Answer: ${question.answer}`);

    // Delete the ongoing question record
    await this.gameModel.deleteOne({ telegramChatId: chatId, telegramMessageThreadId: telegramMessageThreadId }).exec();
  }

  async advanceOngoingGamesOnStartup(): Promise<void> {
    try {
      // Find all ongoing games and advance them immediately or end them
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

        // If game is in final clue stage, reveal answer immediately on startup
        if (game.stage === GAME_STAGE.REVEAL) {
          this.logger.log(`Revealing answer for final stage game ${gameKey} on startup`);
          await this.revealAnswer(game.telegramChatId, game.telegramMessageThreadId);
          continue;
        }

        // For other stages, advance to next stage immediately
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