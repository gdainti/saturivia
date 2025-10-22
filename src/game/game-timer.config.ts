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
    clue1: 30,
    clue2: 20,
    result: 10,
  },
  chgk: {
    clue1: 60,
    clue2: 40,
    result: 10,
  },
};

const DEBUG_TIMING = 5;

export function getTimingForStage(questionType: string, stage: string): number {
  const timings = GAME_TIMINGS[questionType as keyof GameTimings] || GAME_TIMINGS.trivia;
  const isProduction = process.env.NODE_ENV === 'production';

  switch (stage) {
    case 'CLUE_1':
      return isProduction ? timings.clue1 : DEBUG_TIMING;
    case 'CLUE_2':
      return isProduction ? timings.clue2 : DEBUG_TIMING;
    case 'RESULT':
      return isProduction ? timings.result : DEBUG_TIMING;
    default:
      return 0;
  }
}