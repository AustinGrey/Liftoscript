const LB_PER_KG = 2.20462262185;

export function kgToLb(kg: number) {
	return kg * LB_PER_KG;
}
export function lbToKg(lb: number) {
	return lb / LB_PER_KG;
}
