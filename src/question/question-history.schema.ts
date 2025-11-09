import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { GAME_STAGE } from 'src/game/game.schema';
import { Player } from 'src/player/player.schema';
import { Question } from 'src/question/question.schema';

export type QuestionHistoryDocument = QuestionHistory & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'questionHistory',
})
export class QuestionHistory {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Question',
    required: true,
    index: true,
  })
  question: Question;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Player',
    required: false,
    index: true,
  })
  // if player answered the question
  playerId?: Player;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Player',
    required: false,
    index: true,
  })
  triggeredPlayerId?: Player;

  @Prop({ required: false, type: Number, default: 1 })
  score: number;

  @Prop({ required: false, unique: false })
  telegramChatId: number;

  @Prop({ required: false, unique: false })
  telegramMessageThreadId: number;

  @Prop({
    type: String,
    required: false,
    enum: Object.values(GAME_STAGE),
    default: null,
  })
  stage: GAME_STAGE;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const QuestionHistorySchema =
  SchemaFactory.createForClass(QuestionHistory);

QuestionHistorySchema.index(
  { question: 1, playerId: 1 },
  {
    unique: false,
    sparse: true,
    name: 'question_playerId_non_unique',
  },
);

QuestionHistorySchema.index(
  { question: 1, triggeredPlayerId: 1 },
  {
    unique: false,
    sparse: true,
    name: 'question_triggeredPlayerId_non_unique',
  },
);

QuestionHistorySchema.index(
  { question: 1, createdAt: 1 },
  { name: 'question_createdAt' },
);
