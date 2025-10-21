import { Module, forwardRef } from '@nestjs/common';
import { OngoingQuestionService } from './ongoing-question.service';
import { GameTimerService } from './game-timer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { OngoingQuestion, OngoingQuestionSchema } from 'src/schemas/ongoing-question.schema';
import { QuestionModule } from 'src/question/question.module';
import { PlayerModule } from 'src/player/player.module';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OngoingQuestion.name, schema: OngoingQuestionSchema }]),
    QuestionModule,
    PlayerModule,
    forwardRef(() => TelegramModule),
  ],
  providers: [OngoingQuestionService, GameTimerService],
  exports: [OngoingQuestionService, GameTimerService]
})
export class OngoingQuestionModule { }
