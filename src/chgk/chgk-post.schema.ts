import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChGKPostDocument = ChGKPost & Document;

@Schema({ timestamps: true })
export class ChGKPost {
  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop({ type: Number, default: null })
  channelMessageId: number | null;

  @Prop({ type: Number, default: null })
  discussionMessageId: number | null;

  @Prop({ required: true })
  answerScheduledFor: Date;

  @Prop({ type: Date, default: null })
  answerPostedAt: Date | null;
}

export const ChGKPostSchema = SchemaFactory.createForClass(ChGKPost);
