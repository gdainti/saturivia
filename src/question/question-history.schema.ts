import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Player } from 'src/player/player.schema';
import { Question } from 'src/question/question.schema';

export type QuestionHistoryDocument = QuestionHistory & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'questionHistory'
})
export class QuestionHistory {
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
    required: false,
    index: true
  })
  playerId?: Player;

  @Prop({ required: false, type: Number, default: 1 })
  score: number;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const QuestionHistorySchema = SchemaFactory.createForClass(QuestionHistory);

QuestionHistorySchema.index({ questionId: 1, playerId: 1 }, {
  unique: true,
  sparse: true,
});

QuestionHistorySchema.index({ questionId: 1, createdAt: 1 });