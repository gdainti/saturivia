import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Question } from '../question/question.schema';
import { Player } from 'src/player/player.schema';

export enum GAME_STAGE {
  CLUE_0 = 'CLUE_0', // initial state
  CLUE_1 = 'CLUE_1', // first clue
  CLUE_2 = 'CLUE_2', // second clue
  RESULT = 'RESULT', // show answer
}

export type GameDocument = Game & Document;

@Schema({
  timestamps: true,
  collection: 'games',
})
export class Game {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Question',
    required: true,
  })
  question: Question;

  @Prop({ required: true, unique: false, index: true })
  telegramChatId: number;

  @Prop({ required: true, unique: false, index: true })
  telegramMessageThreadId: number;

  @Prop({
    required: true,
    enum: Object.values(GAME_STAGE),
    default: GAME_STAGE.CLUE_0,
  })
  stage: GAME_STAGE;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Player',
    required: false,
    default: null,
  })
  guesser: Player;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Player',
    required: false,
    index: true,
  })
  triggeredPlayerId: Player;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: null })
  clue: string;

  @Prop({ type: Date, default: null })
  lastClueAt: Date | null;
}

export const GameSchema = SchemaFactory.createForClass(Game);
