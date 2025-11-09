import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PlayerService } from './player.service';
import { Player } from './player.schema';
import { QuestionHistory } from '../question/question-history.schema';

describe('PlayerService (getTopPlayers)', () => {
  let service: PlayerService;

  beforeEach(async () => {
    const mockedExec = jest
      .fn()
      .mockResolvedValue([{ playerId: '1', totalScore: 3, username: 'alice' }]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: getModelToken(Player.name), useValue: {} },
        {
          provide: getModelToken(QuestionHistory.name),
          useValue: { aggregate: () => ({ exec: mockedExec }) },
        },
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
    // @ts-ignore
    service.questionHistoryModel = { aggregate: () => ({ exec: mockedExec }) };
  });

  it('should return leaderboard', async () => {
    const top = await service.getTopPlayers(5);
    expect(top).toBeDefined();
    expect(Array.isArray(top)).toBe(true);
  });
});
