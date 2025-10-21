import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Player } from 'src/schemas/player.schema';
import { Question } from 'src/schemas/question.schema';

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
  questionId: Question;

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

// Index for questions with players who answered
QuestionHistorySchema.index({ questionId: 1, playerId: 1 }, {
  unique: true,
  sparse: true // Allows multiple null values for playerId
});

// Index for unanswered questions (where playerId is null)
QuestionHistorySchema.index({ questionId: 1, createdAt: 1 });