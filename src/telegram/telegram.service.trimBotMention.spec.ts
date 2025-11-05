import { TelegramService } from './telegram.service';

describe('trimBotMention', () => {
  let service: TelegramService;
  const botUsername = 'TestBot';

  beforeEach(() => {
    // @ts-ignore
    service = new TelegramService({}, {}, {}, {});
  });

  it('removes mention at the beginning', () => {
    const text = '@TestBot hello world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention at the end', () => {
    const text = 'hello world @TestBot';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention between words', () => {
    const text = 'hello @TestBot world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes multiple mentions', () => {
    const text = '@TestBot hello @TestBot world @TestBot!';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention with extra spaces and punctuation', () => {
    const text = 'hello, @TestBot: world!';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('returns original text if no mention', () => {
    const text = 'hello world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('returns original text if botUsername is undefined', () => {
    const text = '@TestBot hello world';
    expect(service['trimBotMention'](text, undefined)).toBe(text);
  });

  it('removes mention with no @', () => {
    const text = 'hello TestBot world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });

  it('removes mention with mixed case', () => {
    const text = 'hello @testbot world';
    expect(service['trimBotMention'](text, botUsername)).toBe('hello world');
  });
});

describe('hasLeaderboardChanged', () => {
  let service: TelegramService;

  beforeEach(() => {
    // @ts-ignore
    service = new TelegramService({}, {}, {}, {});
  });

  const createMockLeaderboard = (players: Array<{playerId: string, totalScore: number, username?: string}>) =>
    players.map(p => ({ ...p, telegramId: 123 }));

  it('should detect when winner enters leaderboard for first time', () => {
    const before = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' }
    ]);

    const after = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' },
      { playerId: 'winner', totalScore: 80, username: 'winner' }
    ]);

    expect(service['hasLeaderboardChanged'](before, after, 'winner')).toBe(true);
  });

  it('should detect when winner improves position', () => {
    const before = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' },
      { playerId: 'winner', totalScore: 80, username: 'winner' }
    ]);

    const after = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'winner', totalScore: 95, username: 'winner' },
      { playerId: 'player2', totalScore: 90, username: 'user2' }
    ]);

    expect(service['hasLeaderboardChanged'](before, after, 'winner')).toBe(true);
  });

  it('should detect when any position changes', () => {
    const before = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' },
      { playerId: 'player3', totalScore: 80, username: 'user3' }
    ]);

    const after = createMockLeaderboard([
      { playerId: 'player2', totalScore: 95, username: 'user2' },
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player3', totalScore: 80, username: 'user3' }
    ]);

    expect(service['hasLeaderboardChanged'](before, after, 'player2')).toBe(true);
  });

  it('should return false when no positions change', () => {
    const before = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' },
      { playerId: 'winner', totalScore: 80, username: 'winner' }
    ]);

    const after = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' },
      { playerId: 'winner', totalScore: 85, username: 'winner' }
    ]);

    expect(service['hasLeaderboardChanged'](before, after, 'winner')).toBe(false);
  });

  it('should detect when leaderboard length changes', () => {
    const before = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' },
      { playerId: 'player2', totalScore: 90, username: 'user2' }
    ]);

    const after = createMockLeaderboard([
      { playerId: 'player1', totalScore: 100, username: 'user1' }
    ]);

    expect(service['hasLeaderboardChanged'](before, after, 'player1')).toBe(true);
  });
});

describe('formatLeaderboardMessage', () => {
  let service: TelegramService;

  beforeEach(() => {
    // @ts-ignore
    service = new TelegramService({}, {}, {}, {});
  });

  it('should format leaderboard with numbered positions', () => {
    const leaderboard = [
      { playerId: '1', totalScore: 100, username: 'first', telegramId: 123 },
      { playerId: '2', totalScore: 90, username: 'second', telegramId: 124 },
      { playerId: '3', totalScore: 80, username: 'third', telegramId: 125 },
      { playerId: '4', totalScore: 70, username: 'fourth', telegramId: 126 }
    ];

    const result = service['formatLeaderboardMessage'](leaderboard);

    expect(result).toContain('1. first: <b>100.00</b>');
    expect(result).toContain('2. second: <b>90.00</b>');
    expect(result).toContain('3. third: <b>80.00</b>');
    expect(result).toContain('4. fourth: <b>70.00</b>');
  });

  it('should handle empty leaderboard', () => {
    const result = service['formatLeaderboardMessage']([]);
    expect(result).toBe('🫙 No scores yet. Play some games!');
  });

  it('should use telegramId when username is missing', () => {
    const leaderboard = [
      { playerId: '1', totalScore: 100, telegramId: 123 }
    ];

    const result = service['formatLeaderboardMessage'](leaderboard);
    expect(result).toContain('1. 123: <b>100.00</b>');
  });
});

describe('leaderboard caching', () => {
  let service: TelegramService;
  let mockPlayerService: any;

  beforeEach(() => {
    mockPlayerService = {
      getTopPlayers: jest.fn()
    };

    // @ts-ignore
    service = new TelegramService({}, {}, mockPlayerService, {});
  });

  it('should fetch from database only when cache is empty', async () => {
    const mockLeaderboard = [
      { playerId: '1', totalScore: 100, username: 'test', telegramId: 123 }
    ];

    mockPlayerService.getTopPlayers.mockResolvedValue(mockLeaderboard);

    // First call should fetch from database (cache is empty)
    const result1 = await service['getCachedLeaderboard']();
    expect(mockPlayerService.getTopPlayers).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(mockLeaderboard);

    // Second call should use cache (no additional database call)
    const result2 = await service['getCachedLeaderboard']();
    expect(mockPlayerService.getTopPlayers).toHaveBeenCalledTimes(1); // Still 1, not 2
    expect(result2).toEqual(mockLeaderboard);
  });

  it('should update cached score correctly', async () => {
    const mockLeaderboard = [
      { playerId: '1', totalScore: 100, username: 'player1', telegramId: 123 },
      { playerId: '2', totalScore: 90, username: 'player2', telegramId: 124 }
    ];

    mockPlayerService.getTopPlayers.mockResolvedValue(mockLeaderboard);

    // Initialize cache
    await service['getCachedLeaderboard']();

    // Update player2's score
    service['updateCachedLeaderboard']('2', 20, 'player2', 124);

    // Get updated leaderboard
    const result = await service['getCachedLeaderboard']();

    // player2 should now be first with 110 points
    expect(result[0]).toEqual({ playerId: '2', totalScore: 110, username: 'player2', telegramId: 124 });
    expect(result[1]).toEqual({ playerId: '1', totalScore: 100, username: 'player1', telegramId: 123 });

    // Should not have made additional database calls
    expect(mockPlayerService.getTopPlayers).toHaveBeenCalledTimes(1);
  });

  it('should add new player to cache', async () => {
    const mockLeaderboard = [
      { playerId: '1', totalScore: 100, username: 'player1', telegramId: 123 }
    ];

    mockPlayerService.getTopPlayers.mockResolvedValue(mockLeaderboard);

    // Initialize cache
    await service['getCachedLeaderboard']();

    // Add new player
    await service['updateCachedLeaderboard']('3', 110, 'player3', 125);

    // Get updated leaderboard
    const result = await service['getCachedLeaderboard']();

    // New player should be first
    expect(result[0]).toEqual({ playerId: '3', totalScore: 110, username: 'player3', telegramId: 125 });
    expect(result[1]).toEqual({ playerId: '1', totalScore: 100, username: 'player1', telegramId: 123 });
  });

  it('should maintain top 10 limit', async () => {
    // Create 10 players
    const mockLeaderboard = Array.from({ length: 10 }, (_, i) => ({
      playerId: `${i + 1}`,
      totalScore: 100 - i,
      username: `player${i + 1}`,
      telegramId: 123 + i
    }));

    mockPlayerService.getTopPlayers.mockResolvedValue(mockLeaderboard);

    // Initialize cache
    await service['getCachedLeaderboard']();

    // Add a new player with a high score that makes it to top 10
    await service['updateCachedLeaderboard']('11', 95, 'player11', 134);

    // Get updated leaderboard
    const result = await service['getCachedLeaderboard']();

    // Should still have only 10 players, player10 should be kicked out
    expect(result).toHaveLength(10);
    // New player with score 95 should be somewhere in the leaderboard
    const newPlayer = result.find(p => p.playerId === '11');
    expect(newPlayer).toEqual({ playerId: '11', totalScore: 95, username: 'player11', telegramId: 134 });
    // Player10 (lowest score) should no longer be in the leaderboard
    const player10 = result.find(p => p.playerId === '10');
    expect(player10).toBeUndefined();
  });

  it('should clear cache correctly', async () => {
    const mockLeaderboard = [
      { playerId: '1', totalScore: 100, username: 'test', telegramId: 123 }
    ];

    mockPlayerService.getTopPlayers.mockResolvedValue(mockLeaderboard);

    // Populate cache
    await service['getCachedLeaderboard']();
    expect(mockPlayerService.getTopPlayers).toHaveBeenCalledTimes(1);

    // Clear cache
    service['clearLeaderboardCache']();

    // Next call should fetch from database again
    await service['getCachedLeaderboard']();
    expect(mockPlayerService.getTopPlayers).toHaveBeenCalledTimes(2);
  });
});
