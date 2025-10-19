import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Player } from 'src/schemas/player.shema';
import { Question } from 'src/schemas/question.schema';

export type PlayerAnswerDocument = PlayerAnswer & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'playerAnswers'
})
export class PlayerAnswer {
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
    required: true,
    index: true
  })
  playerId: Player;

  @Prop({ required: false, type: Number, default: 1 })
  score: number;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const PlayerAnswerSchema = SchemaFactory.createForClass(PlayerAnswer);

PlayerAnswerSchema.index({ questionId: 1, playerId: 1 }, { unique: true });