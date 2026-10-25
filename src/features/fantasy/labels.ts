import type { Competition, Position } from "./types";

export const COMPETITION_LABELS: Record<Competition, string> = {
  laliga: "LaLiga",
  ucl: "Champions League",
  copa: "Copa del Rey",
};

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

export const SCORE_LABELS: Record<string, string> = {
  appearance: "Appearance",
  goals: "Goals",
  assists: "Assists",
  cleanSheet: "Clean sheet",
  saves: "Saves",
  penaltiesSaved: "Penalty saved",
  penaltiesMissed: "Penalty missed",
  goalsConceded: "Goals conceded",
  yellowCards: "Yellow card",
  redCards: "Red card",
  ownGoals: "Own goal",
};
