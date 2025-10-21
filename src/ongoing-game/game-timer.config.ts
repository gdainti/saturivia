export interface GameTimingConfig {
  clue1: number;
  clue2: number;
  result: number; // time to wait after last clue before showing result
}

export interface GameTimings {
  trivia: GameTimingConfig;
  chgk: GameTimingConfig;
}

// in seconds
export const GAME_TIMINGS: GameTimings = {
  trivia: {
    clue1: 20,
    clue2: 30,
    result: 30,
  },
  chgk: {
    clue1: 60,
    clue2: 40,
    result: 30,
  },
};

export function getTimingForStage(questionType: string, stage: string): number {
  const timings = GAME_TIMINGS[questionType as keyof GameTimings] || GAME_TIMINGS.trivia;

  switch (stage) {
    case 'CLUE_1':
      return timings.clue1;
    case 'CLUE_2':
      return timings.clue2;
    case 'RESULT':
      return timings.result;
    default:
      return 0;
  }
}