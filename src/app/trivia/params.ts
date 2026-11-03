import { isArchiveDay, parsePeriod, type Period } from "@/features/boards/period";
import { triviaDay } from "@/features/trivia/game";

export interface TriviaSearchParams {
  day?: string;
  period?: string;
  league?: string;
}

/** The day to show (today, or a valid archive day), the board period and league. */
export function triviaParams(sp: TriviaSearchParams): {
  today: string;
  day: string;
  practice: boolean;
  period: Period;
  league?: string;
} {
  const today = triviaDay();
  const day = isArchiveDay(sp.day, today) ? sp.day : today;
  return {
    today,
    day,
    practice: day !== today,
    period: parsePeriod(sp.period),
    league: sp.league || undefined,
  };
}
