import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestionService } from './question.service';
import { Question, QuestionSchema } from 'src/question/question.schema';
import { QuestionHistory, QuestionHistorySchema } from './question-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: QuestionHistory.name, schema: QuestionHistorySchema }
    ]),
  ],
  providers: [QuestionService],
  exports: [QuestionService]
})
export class QuestionModule {}