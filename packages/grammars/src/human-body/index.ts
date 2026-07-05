import { z } from "zod";

export const availableBodyParts = [
	"Back",
	"Calves",
	"Chest",
	"Forearms",
	"Hips",
	"Shoulders",
	"Thighs",
	"Upper Arms",
	"Waist",
];
export const TBodyPart = z.enum(availableBodyParts);
export type IBodyPart = z.infer<typeof TBodyPart>;
export const availableMuscles = [
	"Adductor Brevis",
	"Adductor Longus",
	"Adductor Magnus",
	"Biceps Brachii",
	"Brachialis",
	"Brachioradialis",
	"Deltoid Anterior",
	"Deltoid Lateral",
	"Deltoid Posterior",
	"Erector Spinae",
	"Gastrocnemius",
	"Gluteus Maximus",
	"Gluteus Medius",
	"Hamstrings",
	"Iliopsoas",
	"Infraspinatus",
	"Latissimus Dorsi",
	"Levator Scapulae",
	"Obliques",
	"Pectineous",
	"Pectoralis Major Clavicular Head",
	"Pectoralis Major Sternal Head",
	"Quadriceps",
	"Rectus Abdominis",
	"Sartorius",
	"Serratus Anterior",
	"Soleus",
	"Splenius",
	"Sternocleidomastoid",
	"Tensor Fasciae Latae",
	"Teres Major",
	"Teres Minor",
	"Tibialis Anterior",
	"Trapezius Lower Fibers",
	"Trapezius Middle Fibers",
	"Trapezius Upper Fibers",
	"Triceps Brachii",
	"Wrist Extensors",
	"Wrist Flexors",
] as const;
export const TMuscle = z.enum(availableMuscles);
export type IMuscle = z.infer<typeof TMuscle>;
export const screenMuscles = [
	"shoulders",
	"triceps",
	"back",
	"abs",
	"glutes",
	"hamstrings",
	"quadriceps",
	"chest",
	"biceps",
	"calves",
	"forearms",
] as const;
export const TScreenMuscle = z.union([z.enum(screenMuscles), z.string()]);
export type IScreenMuscle = z.infer<typeof TScreenMuscle>;
