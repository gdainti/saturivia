import { Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Player, PlayerSchema } from 'src/schemas/player.schema';
import { QuestionHistory, QuestionHistorySchema } from 'src/schemas/question-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Player.name, schema: PlayerSchema },
      { name: QuestionHistory.name, schema: QuestionHistorySchema },
    ]),
  ],
  providers: [PlayerService],
  exports: [PlayerService]
})
export class PlayerModule { }
