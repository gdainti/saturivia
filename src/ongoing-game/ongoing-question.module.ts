import { Module } from '@nestjs/common';
import { OngoingQuestionService } from './ongoing-question.service';
import { MongooseModule } from '@nestjs/mongoose';
import { OngoingQuestion, OngoingQuestionSchema } from 'src/schemas/ongoing-question.schema';
import { QuestionModule } from 'src/question/question.module';
import { PlayerService } from 'src/player/player.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OngoingQuestion.name, schema: OngoingQuestionSchema }]),
    QuestionModule,
  ],
  providers: [OngoingQuestionService, PlayerService]
})
export class OngoingQuestionModule { }
