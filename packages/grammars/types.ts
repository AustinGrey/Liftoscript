export type IUnit = "kg" | "lb";

export interface IWeight {
  value: number;
  unit: IUnit;
}

export type IProgramState = Record<string, unknown>;

export type IProgramStateMetadata = Record<
  string,
  { userPrompted: boolean } | undefined
>;

export interface IDayData {
  day: number;
  week: number;
  dayInWeek: number;
}

export interface IExerciseType {
  id: string;
  name: string;
  equipment?: string;
}

// The real app likely has a richer shape; for grammars tests we only need lookups.
export type IAllCustomExercises = Record<string, unknown>;

export interface ISettings {
  units: IUnit;
  exercises: IAllCustomExercises;
  // Allow older planner codepaths to read extra settings without breaking.
  [key: string]: unknown;
}

export interface IPlannerProgramDay {
  exerciseText: string;
}

export interface IPlannerProgram {
  weeks: Array<{ days: IPlannerProgramDay[] }>;
}

