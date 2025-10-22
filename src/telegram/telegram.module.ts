import { Module, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuestionModule } from 'src/question/question.module';
import { PlayerModule } from 'src/player/player.module';
import { GameModule } from 'src/game/game.module';
import { TelegramService } from 'src/telegram/telegram.service';

@Module({
  imports: [
    ConfigModule,
    QuestionModule,
    PlayerModule,
    forwardRef(() => GameModule),
  ],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
