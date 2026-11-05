/** Termes du Glossaire dont la bulle s'est ouverte au clavier, le temps de la visite. */
import { SvelteSet } from 'svelte/reactivity';

export const termesVus = new SvelteSet<string>();

export function apprendre(ancre: string) {
	termesVus.add(ancre);
}
