import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlayerDocument = Player & Document;

@Schema({
  timestamps: true,
  collection: 'players',
})
export class Player {
  @Prop({ required: true, unique: true, index: true })
  telegramId: number;

  @Prop({ required: false })
  username: string;

  @Prop({ default: false })
  isDeleted: boolean;

  /* @Prop({ type: Number, default: 0 })
  guesses: number;

  @Prop({ type: Number, default: 0 })
  score: number; */
}

export const PlayerSchema = SchemaFactory.createForClass(Player);
