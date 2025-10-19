import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuestionDocument = Question & Document;

@Schema({
  timestamps: true,
  collection: 'questions'
})
export class Question {

  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop({ required: false, index: true })
  category: string;

  @Prop({ required: false, index: true })
  language: string;

  @Prop({ required: false, type: Number, default: 1 })
  difficulty: number;

  @Prop({ default: null, type: Date })
  lastAskedAt: Date | null;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);