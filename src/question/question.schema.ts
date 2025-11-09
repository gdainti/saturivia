import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QUESTION_TYPE } from 'src/question/question-type';

export type QuestionDocument = Question & Document;

@Schema({
  timestamps: true,
  collection: 'questions',
})
export class Question {
  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  // history, math, harry potter, etc
  @Prop({ required: false, index: true })
  category: string;

  // en, ru
  @Prop({ required: false, index: true })
  language: string;

  // defines score for the guesser
  @Prop({ required: false, type: Number, default: 1 })
  difficulty: number;

  // different types of question: trivia-like or logical deduction
  @Prop({ required: true, default: QUESTION_TYPE.TRIVIA })
  type: string;

  // answer explanation
  @Prop({ required: false })
  comment: string;

  // textual hint for the question
  @Prop({ required: false })
  hint: string;

  // for images or attachments
  @Prop({ required: false })
  url: string;

  // for fetching new random question
  @Prop({ default: new Date(), type: Date })
  lastAskedAt: Date | null;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
