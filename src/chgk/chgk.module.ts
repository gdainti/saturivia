import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramModule } from 'src/telegram/telegram.module';
import { ChGKPost, ChGKPostSchema } from './chgk-post.schema';
import { ChGKFetcherService } from './chgk-fetcher.service';
import { ChGKService } from './chgk.service';

@Module({
  imports: [
    ConfigModule,
    TelegramModule,
    MongooseModule.forFeature([{ name: ChGKPost.name, schema: ChGKPostSchema }]),
  ],
  providers: [ChGKFetcherService, ChGKService],
})
export class ChGKModule {}
