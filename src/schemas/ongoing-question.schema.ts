import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Question } from './question.schema';
import { Player } from 'src/schemas/player.schema';

export enum GAME_STAGE {
  CLUE_0 = 'CLUE_0',
  CLUE_1 = 'CLUE_1',
  CLUE_2 = 'CLUE_2',
  REVEAL = 'REVEAL',
}

export type OngoingQuestionDocument = OngoingQuestion & Document;

@Schema({
  timestamps: true,
  collection: 'ongoingQuestions'
})
export class OngoingQuestion {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Question',
    required: true
  })
  questionId: Question;

  @Prop({ required: true, unique: false, index: true })
  telegramChatId: number;

  @Prop({ required: true, unique: false, index: true })
  telegramMessageId: number;

  @Prop({
    required: true,
    enum: Object.values(GAME_STAGE),
    default: GAME_STAGE.CLUE_0
  })
  stage: GAME_STAGE;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Player',
    required: false,
    default: null
  })
  guesserId: Player;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: null })
  clue: string;

  @Prop({ type: Date, default: null })
  lastClueAt: Date | null;
}

export const OngoingQuestionSchema = SchemaFactory.createForClass(OngoingQuestion);