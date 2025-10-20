import { Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Player, PlayerSchema } from 'src/schemas/player.shema';
import { PlayerAnswer, PlayerAnswerSchema } from 'src/schemas/player-answer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Player.name, schema: PlayerSchema },
      { name: PlayerAnswer.name, schema: PlayerAnswerSchema },
    ]),
  ],
  providers: [PlayerService],
  exports: [PlayerService]
})
export class PlayerModule { }
