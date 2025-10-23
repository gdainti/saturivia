import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Player } from 'src/player/player.schema';
import { Question } from 'src/question/question.schema';

export type IncorrectAnswerDocument = IncorrectAnswer & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'incorrectAnswers'
})
export class IncorrectAnswer {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Question',
    required: true,
    index: true
  })
  question: Question;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Player',
    required: true,
    index: true
  })
  playerId?: Player;

  @Prop({ required: false, unique: false })
  telegramChatId: number;

  @Prop({ required: false, unique: false })
  telegramMessageThreadId: number;

  @Prop({ default: null })
  answer: string;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const IncorrectAnswerSchema = SchemaFactory.createForClass(IncorrectAnswer);

IncorrectAnswerSchema.index({ question: 1, playerId: 1, telegramChatId: 1, telegramMessageThreadId: 1 }, {
  unique: false,
  sparse: true,
  name: 'question_playerId_chat_unique',
});

IncorrectAnswerSchema.index({ question: 1, createdAt: 1 }, { name: 'question_createdAt' });
