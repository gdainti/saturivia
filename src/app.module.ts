import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PlayerModule } from './player/player.module';
import { QuestionModule } from './question/question.module';
import { GameModule } from './game/game.module';
import { TelegramModule } from './telegram/telegram.module';
import { ChGKModule } from './chgk/chgk.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const username = configService.get<string>('MONGO_USERNAME');
        const password = configService.get<string>('MONGO_PASSWORD');
        const host = configService.get<string>('MONGO_HOST');
        const port = configService.get<string>('MONGO_PORT');
        const database = configService.get<string>('MONGO_DATABASE');
        const authDB = configService.get<string>('MONGO_AUTH_DB');

        const safeUsername = encodeURIComponent(username ?? '');
        const safePassword = encodeURIComponent(password ?? '');

        const uri = `mongodb://${safeUsername}:${safePassword}@${host}:${port}/${database}?authSource=${authDB}`;

        return {
          uri: uri,
          authSource: authDB,
        };
      },
      inject: [ConfigService],
    }),

    PlayerModule,
    QuestionModule,
    GameModule,
    TelegramModule,
    ChGKModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
