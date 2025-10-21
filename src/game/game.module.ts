import { Module, forwardRef } from '@nestjs/common';
import { GameService } from './game.service';
import { GameTimerService } from './game-timer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Game, GameSchema } from 'src/game/game.schema';
import { QuestionModule } from 'src/question/question.module';
import { PlayerModule } from 'src/player/player.module';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Game.name, schema: GameSchema }]),
    QuestionModule,
    PlayerModule,
    forwardRef(() => TelegramModule),
  ],
  providers: [GameService, GameTimerService],
  exports: [GameService, GameTimerService]
})
export class GameModule { }
