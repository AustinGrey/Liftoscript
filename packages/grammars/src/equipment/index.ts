import { z } from "zod";
import { TUnit, TWeight } from "@/quantities/weight.ts";
import type { OpenRecord } from "@/utils/types.ts";
import { TPlate } from "@/common-types.ts";

export const TEquipmentType = z.string();
export type IEquipmentType = z.infer<typeof TEquipmentType>;

/**
 * The various known broad categories of equipment built in to the system.
 * There may be other categories which a user would add to themselves, but these are the ones known always.
 */
export const builtInEquipmentTypes = [
	"barbell",
	"cable",
	"dumbbell",
	"smith",
	"band",
	"kettlebell",
	"bodyweight",
	"leverageMachine",
	"medicineball",
	"ezbar",
	"trapbar",
] as const satisfies IEquipmentType[];
export const TBuiltinEquipmentTypes = z.enum(builtInEquipmentTypes);
export type IBuiltinEquipmentTypes = z.infer<typeof TBuiltinEquipmentTypes>;

/**
 * Definition of how to treat a piece of equipment for calculations
 */
export const TEquipmentData = z.strictObject({
	/**
	 * The weight of the bar
	 */
	bar: z.strictObject({
		// @todo why is this specified twice when a single TWeight can handle either?
		lb: TWeight,
		kg: TWeight,
	}),
	multiplier: z.number(),
	/**
	 * What bar plates are available
	 */
	plates: z.array(TPlate),
	fixed: z.array(TWeight),
	isFixed: z.boolean(),
	unit: TUnit.optional(),
	name: z.string().optional(),
	similarTo: z.string().optional(),
	isDeleted: z.boolean().optional(),
	useBodyweightForBar: z.boolean().optional(),
	isAssisting: z.boolean().optional(),
	notes: z.string().optional(),
});
export type IEquipmentData = z.infer<typeof TEquipmentData>;
/**
 * A dictionary combining custom equipment categories with the built in ones, and the settings to use for them
 */
export type IAllEquipment = OpenRecord<
	IEquipmentData,
	| IBuiltinEquipmentTypes
	// Because the user can specify their own equipment categories, the key could be any string
	| string
>;

export function equipmentName(
	equipment: IEquipmentType | undefined,
	equipmentSettings?: IAllEquipment,
): string {
	const equipmentData = equipment && equipmentSettings ? equipmentSettings[equipment] : undefined;
	// @todo if this is the way to get the name of a piece of equipment, why bother with this hard coded list in here? We should move the hard coded list into the equipment data for the builtins
	if (equipmentData?.name) {
		return equipmentData.name.trim();
	}
	switch (equipment) {
		case "barbell":
			return "Barbell";
		case "cable":
			return "Cable";
		case "dumbbell":
			return "Dumbbell";
		case "smith":
			return "Smith Machine";
		case "band":
			return "Band";
		case "kettlebell":
			return "Kettlebell";
		case "bodyweight":
			return "Bodyweight";
		case "leverageMachine":
			return "Leverage Machine";
		case "medicineball":
			return "Medicine Ball";
		case "ezbar":
			return "EZ Bar";
		case "trapbar":
			return "Trap Bar";
		default:
			return "";
	}
}
