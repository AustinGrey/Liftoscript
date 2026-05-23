import { default as unit } from "./unitmathfork/Unit.ts";

type UnitMath = ReturnType<typeof unit.config<number>>;

/**
 * @returns an instance of unitmath, where the "%" unit has been initialized as equivalent to a percentage of the 1RM
 * @param options
 * @param options.oneRepMax The 1RM of the user this unitmath should consider.
 */
export function getUnitMath({
  oneRepMax,
}: {
  oneRepMax: [number, "lb" | "kg"];
}): UnitMath {
  return unit.config({
    definitions: {
      units: {
        "%": { value: `${oneRepMax[0] / 100} ${oneRepMax[1]}` },
      },
    },
  });
}
