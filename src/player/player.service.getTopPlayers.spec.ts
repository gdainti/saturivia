import { Test, TestingModule } from '@nestjs/testing';
import { PlayerService } from './player.service';

describe('PlayerService (getTopPlayers)', () => {
  let service: PlayerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: 'PlayerModel', useValue: {} },
        { provide: 'PlayerAnswerModel', useValue: { aggregate: jest.fn().mockResolvedValue([ { playerId: '1', totalScore: 3, username: 'alice' } ]) } },
      ],
    })
      .compile();

    service = module.get<PlayerService>(PlayerService);
    // @ts-ignore
    service.playerAnswerModel = { aggregate: jest.fn().mockResolvedValue([ { playerId: '1', totalScore: 3, username: 'alice' } ]) };
  });

  it('should return leaderboard', async () => {
    const top = await service.getTopPlayers(5);
    expect(top).toBeDefined();
    expect(Array.isArray(top)).toBe(true);
  });
});
