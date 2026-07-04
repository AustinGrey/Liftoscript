import { buildWeight } from "grammars";
import type { IUnit, IWeight } from "grammars";
import type { SimulationOptions } from "./simulation.ts";

export interface PlaygroundState {
  units: IUnit;
  numberOfSessions: number;
  /** exercise key -> numeric 1RM in the current unit (undefined = use the library default) */
  oneRepMaxes: Record<string, number | undefined>;
}

export function createDefaultState(): PlaygroundState {
  return { units: "lb", numberOfSessions: 12, oneRepMaxes: {} };
}

export function toSimulationOptions(state: PlaygroundState): SimulationOptions {
  const oneRepMaxes: Record<string, IWeight | undefined> = {};
  for (const [key, value] of Object.entries(state.oneRepMaxes)) {
    if (value != null && !Number.isNaN(value) && value > 0) {
      oneRepMaxes[key] = buildWeight(value, state.units);
    }
  }
  return {
    units: state.units,
    numberOfSessions: state.numberOfSessions,
    oneRepMaxes,
  };
}
