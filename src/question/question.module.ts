import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestionService } from './question.service';
import { Question, QuestionSchema } from 'src/schemas/question.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Question.name, schema: QuestionSchema }]),
  ],
  providers: [QuestionService],
  exports: [QuestionService]
})
export class QuestionModule {}