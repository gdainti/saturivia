import { Module } from '@nestjs/common';
import { OngoingQuestionService } from './ongoing-question.service';
import { MongooseModule } from '@nestjs/mongoose';
import { OngoingQuestion, OngoingQuestionSchema } from 'src/schemas/ongoing-question.schema';
import { QuestionModule } from 'src/question/question.module';
import { PlayerModule } from 'src/player/player.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OngoingQuestion.name, schema: OngoingQuestionSchema }]),
    QuestionModule,
    PlayerModule,
  ],
  providers: [OngoingQuestionService],
  exports: [OngoingQuestionService]
})
export class OngoingQuestionModule { }
