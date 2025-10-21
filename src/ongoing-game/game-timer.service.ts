import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OngoingQuestion, OngoingQuestionDocument, GAME_STAGE } from 'src/schemas/ongoing-question.schema';
import { QuestionDocument } from 'src/schemas/question.schema';
import { getTimingForStage } from './game-timer.config';
import { PlayerService } from '../player/player.service';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class GameTimerService implements OnModuleInit {
  private readonly logger = new Logger(GameTimerService.name);
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(OngoingQuestion.name) private ongoingQuestionModel: Model<OngoingQuestionDocument>,
    private playerService: PlayerService,
    @Inject(forwardRef(() => TelegramService)) private telegramService: TelegramService,
  ) {}

  async onModuleInit() {
    this.logger.log('GameTimerService initialized, advancing any ongoing games...');
    await this.advanceOngoingGamesOnStartup();
  }  async startTimer(chatId: number, messageId: number, questionType: string, currentStage: GAME_STAGE): Promise<void> {
    const gameKey = `${chatId}_${messageId}`;

    this.clearTimer(gameKey);

    const nextStage = this.getNextStage(currentStage);
    if (!nextStage) {
      this.logger.log(`No next stage for ${currentStage}, game should end`);
      return;
    }

    const delaySeconds = getTimingForStage(questionType, nextStage);
    if (delaySeconds === 0) {
      this.logger.log(`No timing configured for stage ${nextStage}, ending game`);
      await this.endGame(chatId, messageId);
      return;
    }

    this.logger.log(`Setting timer for ${gameKey} to advance to ${nextStage} in ${delaySeconds} seconds`);

    const timer = setTimeout(async () => {
      try {
        await this.advanceGame(chatId, messageId, nextStage);
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

  async stopTimer(chatId: number, messageId: number): Promise<void> {
    const prefix = `${chatId}_${messageId}`;
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
        return null; // Game should end after CLUE_2
      default:
        return null;
    }
  }

  private async advanceGame(chatId: number, messageId: number, newStage: GAME_STAGE): Promise<void> {
    try {
      const game = await this.ongoingQuestionModel
        .findOne({
          telegramChatId: chatId,
          telegramMessageId: messageId,
          isDeleted: false
        })
        .populate('questionId')
        .exec();

      if (!game) {
        this.logger.log(`Game ${chatId}_${messageId} not found, may have been ended already`);
        return;
      }

      const question = game.questionId as QuestionDocument;
      const clue = this.generateClue(question, newStage);

      // Update game stage and clue
      await this.ongoingQuestionModel.updateOne(
        { telegramChatId: chatId, telegramMessageId: messageId },
        {
          $set: {
            stage: newStage,
            clue,
            lastClueAt: new Date()
          }
        }
      );

      this.logger.log(`Advanced game ${chatId}_${messageId} to ${newStage}`);

      // Notify chat of new clue
      await this.telegramService.sendMessage(chatId, messageId, `Clue (${newStage}): ${clue}`);

      // Start timer for next stage or reveal
      if (newStage === GAME_STAGE.CLUE_2) {
        // Last clue, schedule reveal answer using configurable result timeout
        const resultTimeoutMs = getTimingForStage(question.type, 'RESULT') * 1000;
        const revealTimer = setTimeout(async () => {
          try {
            await this.revealAnswer(chatId, messageId);
          } catch (err) {
            this.logger.error(`Error revealing answer for ${chatId}_${messageId}:`, err);
          }
        }, resultTimeoutMs);

        this.activeTimers.set(`${chatId}_${messageId}_end`, revealTimer);
      } else {
        await this.startTimer(chatId, messageId, question.type, newStage);
      }

      // TODO: Emit event or call telegram service to send clue to chat

    } catch (error) {
      this.logger.error(`Error advancing game ${chatId}_${messageId}:`, error);
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
    const words = answer.split(' ');
    const totalChars = answer.replace(/\s/g, '').length;

    let revealPercentage: number;
    switch (stage) {
      case GAME_STAGE.CLUE_1:
        revealPercentage = 0.3; // 30% (more revealing since we only have 2 clues)
        break;
      case GAME_STAGE.CLUE_2:
        revealPercentage = 0.6; // 60% (final clue before result)
        break;
      default:
        revealPercentage = 0;
    }

    const charsToReveal = Math.max(1, Math.floor(totalChars * revealPercentage));
    let revealedChars = 0;

    return words.map(word => {
      if (revealedChars >= charsToReveal) {
        return '_'.repeat(word.length);
      }

      const wordReveal = Math.min(word.length, charsToReveal - revealedChars);
      revealedChars += wordReveal;

      return word.substring(0, wordReveal) + '_'.repeat(word.length - wordReveal);
    }).join(' ');
  }

  async endGame(chatId: number, messageId: number): Promise<void> {
    try {
      const game = await this.ongoingQuestionModel
        .findOne({
          telegramChatId: chatId,
          telegramMessageId: messageId,
          isDeleted: false
        })
        .populate('questionId')
        .exec();

      if (!game) {
        this.logger.log(`Game ${chatId}_${messageId} not found for ending`);
        return;
      }

      // Stop any active timers
      await this.stopTimer(chatId, messageId);
      const endTimerKey = `${chatId}_${messageId}_end`;
      this.clearTimer(endTimerKey);

      // Record as unanswered question in history
      const question = game.questionId as any;
      if (question?._id) {
        await this.playerService.recordUnansweredQuestion(question._id.toString());
      }

      // Mark game as deleted (soft delete)
      await this.ongoingQuestionModel.updateOne(
        { telegramChatId: chatId, telegramMessageId: messageId },
        {
          $set: {
            isDeleted: true,
            stage: GAME_STAGE.REVEAL
          }
        }
      );

      // TODO: Emit event or call telegram service to notify chat that game ended

      this.logger.log(`Game ${chatId}_${messageId} ended due to timeout`);
    } catch (error) {
      this.logger.error(`Error ending game ${chatId}_${messageId}:`, error);
    }
  }

  // New method to transition game to ANSWER_REVEALED stage without deleting
  private async revealAnswer(chatId: number, messageId: number): Promise<void> {
    const game = await this.ongoingQuestionModel
      .findOne({ telegramChatId: chatId, telegramMessageId: messageId, isDeleted: false })
      .populate('questionId')
      .exec();
    if (!game) {
      this.logger.log(`Game ${chatId}_${messageId} not found for revealing`);
      return;
    }

    const question = game.questionId as QuestionDocument;
    // Update stage to reveal and set clue to full answer
    await this.ongoingQuestionModel.updateOne(
      { telegramChatId: chatId, telegramMessageId: messageId },
      {
        $set: {
          stage: GAME_STAGE.REVEAL,
          clue: question.answer,
          lastClueAt: new Date(),
        }
      }
    );

    this.logger.log(`Revealed answer for game ${chatId}_${messageId}`);
    // Notify chat of answer
    await this.telegramService.sendMessage(chatId, messageId, `Answer: ${question.answer}`);

    // Delete the ongoing question record
    await this.ongoingQuestionModel.deleteOne({ telegramChatId: chatId, telegramMessageId: messageId }).exec();
  }

  async advanceOngoingGamesOnStartup(): Promise<void> {
    try {
      // Find all ongoing games and advance them immediately or end them
      const ongoingGames = await this.ongoingQuestionModel
        .find({
          isDeleted: false,
        })
        .populate('questionId')
        .exec();

      if (ongoingGames.length === 0) {
        this.logger.log('No ongoing games found on startup');
        return;
      }

      this.logger.log(`Found ${ongoingGames.length} ongoing games on startup, advancing them...`);

      for (const game of ongoingGames) {
        const gameKey = `${game.telegramChatId}_${game.telegramMessageId}`;

        // If game is in final clue stage, reveal answer immediately on startup
        if (game.stage === GAME_STAGE.REVEAL) {
          this.logger.log(`Revealing answer for final stage game ${gameKey} on startup`);
          await this.revealAnswer(game.telegramChatId, game.telegramMessageId);
          continue;
        }

        // For other stages, advance to next stage immediately
        const nextStage = this.getNextStage(game.stage);
        if (nextStage) {
          this.logger.log(`Advancing game ${gameKey} from ${game.stage} to ${nextStage} on startup`);
          await this.advanceGame(game.telegramChatId, game.telegramMessageId, nextStage);
        } else {
          this.logger.log(`Ending game ${gameKey} (no next stage) on startup`);
          await this.endGame(game.telegramChatId, game.telegramMessageId);
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