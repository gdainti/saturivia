import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlayerModule } from './player/player.module';
import { QuestionModule } from './question/question.module';
import { OngoingQuestionModule } from './ongoing-game/ongoing-question.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const username = configService.get('MONGO_USERNAME');
        const password = configService.get('MONGO_PASSWORD');
        const host = configService.get('MONGO_HOST');
        const port = configService.get('MONGO_PORT');
        const database = configService.get('MONGO_DATABASE');
        const authDB = configService.get('MONGO_AUTH_DB');

        const safeUsername = encodeURIComponent(username);
        const safePassword = encodeURIComponent(password);

        const uri = `mongodb://${safeUsername}:${safePassword}@${host}:${port}/${database}`;

        console.log(`Connecting to MongoDB "${database}" database`);

        return {
          uri: uri,
          authSource: authDB,
        };
      },
      inject: [ConfigService],
    }),

    PlayerModule,
    QuestionModule,
    OngoingQuestionModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}