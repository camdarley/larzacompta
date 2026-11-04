/** File des `toast` : 6 s, en pause au survol ou au focus (EXPERIENCE.md). */
export type Toast = {
	id: number;
	texte: string;
	action?: { libelle: string; faire: () => void };
};

const DUREE = 6000;

let suivant = 1;
const minuteries: Record<number, ReturnType<typeof setTimeout>> = {};

export const toasts = $state<{ liste: Toast[] }>({ liste: [] });

export function retirerToast(id: number) {
	suspendreToast(id);
	toasts.liste = toasts.liste.filter((t) => t.id !== id);
}

export function reprendreToast(id: number) {
	suspendreToast(id);
	minuteries[id] = setTimeout(() => retirerToast(id), DUREE);
}

export function suspendreToast(id: number) {
	clearTimeout(minuteries[id]);
	delete minuteries[id];
}

export function afficherToast(texte: string, action?: Toast['action']) {
	const id = suivant++;
	toasts.liste = [...toasts.liste, { id, texte, action }];
	reprendreToast(id);
	return id;
}
