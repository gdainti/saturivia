import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Question } from './question.schema';
import { Player } from 'src/schemas/player.shema';

export enum GAME_STAGE {
  CLUE_0 = 'CLUE_0',
  CLUE_1 = 'CLUE_1',
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

  @Prop({ required: true, unique: true, index: true })
  telegramChatId: number;

  @Prop({
    required: true,
    enum: [GAME_STAGE.CLUE_0, GAME_STAGE.CLUE_1],
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
}

export const OngoingQuestionSchema = SchemaFactory.createForClass(OngoingQuestion);