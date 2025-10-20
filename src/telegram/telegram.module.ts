import { Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuestionModule } from 'src/question/question.module';
import { PlayerModule } from 'src/player/player.module';
import { OngoingQuestionModule } from 'src/ongoing-game/ongoing-question.module';
import { TelegramService } from 'src/telegram/telegram.service';

@Module({
  imports: [ConfigModule, QuestionModule, PlayerModule, OngoingQuestionModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
