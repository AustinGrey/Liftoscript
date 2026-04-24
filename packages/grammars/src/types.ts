import { z as t } from "zod";

export const units = ["kg", "lb"] as const;

export const TUnit = t.enum(units);
export type IUnit = t.infer<typeof TUnit>;

export const percentageUnits = ["%"] as const;

export const TPercentageUnit = t.enum(percentageUnits);
export type IPercentageUnit = t.infer<typeof TPercentageUnit>;

export const TPercentage = t.object({
  value: t.number(),
  unit: TPercentageUnit,
});
export type IPercentage = t.TypeOf<typeof TPercentage>;

export const TWeight = t.object({
  value: t.number(),
  unit: TUnit,
});
export type IWeight = t.TypeOf<typeof TWeight>;

export const TProgramState = t.record(
  t.string(),
  t.union([t.number(), TWeight, TPercentage]),
);
export type IProgramState = t.TypeOf<typeof TProgramState>;

export const TPlannerProgramDay = t.intersection(
  t.object({
    name: t.string(),
    exerciseText: t.string(),
  }),
  t
    .object({
      id: t.string(),
      description: t.string(),
    })
    .partial(),
);
export type IPlannerProgramDay = t.TypeOf<typeof TPlannerProgramDay>;

export const TPlannerProgramWeek = t.intersection(
  t.object({
    name: t.string(),
    days: t.array(TPlannerProgramDay),
  }),
  t
    .object({
      id: t.string(),
      description: t.string(),
    })
    .partial(),
);
export type IPlannerProgramWeek = Readonly<
  t.TypeOf<typeof TPlannerProgramWeek>
>;

export const TPlannerProgram = t.object({
  vtype: t.literal("planner"),
  name: t.string(),
  weeks: t.array(TPlannerProgramWeek),
});
export type IPlannerProgram = Readonly<t.TypeOf<typeof TPlannerProgram>>;
