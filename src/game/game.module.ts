import { Module, forwardRef } from '@nestjs/common';
import { GameService } from './game.service';
import { GameTimerService } from './game-timer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Game, GameSchema } from 'src/game/game.schema';
import { QuestionModule } from 'src/question/question.module';
import { PlayerModule } from 'src/player/player.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { QuestionHistory, QuestionHistorySchema } from 'src/question/question-history.schema';
import { IncorrectAnswer, IncorrectAnswerSchema } from 'src/question/incorrect-answer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Game.name, schema: GameSchema },
      { name: QuestionHistory.name, schema: QuestionHistorySchema },
      { name: IncorrectAnswer.name, schema: IncorrectAnswerSchema },
    ]),
    QuestionModule,
    PlayerModule,
    forwardRef(() => TelegramModule),
  ],
  providers: [GameService, GameTimerService],
  exports: [GameService, GameTimerService]
})
export class GameModule { }
