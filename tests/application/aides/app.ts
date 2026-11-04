import type { AccesConnecte } from '#lib/domaine/acces.ts';
import { composer, type Application } from '#lib/server/composition.ts';
import type { Hacheur } from '#lib/server/application/ports.ts';
import { baseMigree } from './base.ts';

/** Hacheur de test : argon2 est testé à part, et ralentirait inutilement chaque cas. */
const hacheurRapide: Hacheur = {
	hacher: (m) => `test$${m}`,
	verifier: (m, phc) => phc === `test$${m}`
};

export type Banc = {
	app: Application;
	horloge: { instant: string; maintenant(): string };
	base: ReturnType<typeof baseMigree>;
	tresorier: AccesConnecte;
	ctx(): ReturnType<Application['ctx']>;
	journal(): { evenement: string; resume: string; acces_nom: string }[];
};

export function banc(instant = '2026-11-04T10:00:00.000Z'): Banc {
	const base = baseMigree();
	const horloge = {
		instant,
		maintenant() {
			return this.instant;
		}
	};
	const app = composer({
		base,
		horloge,
		hacheur: hacheurRapide,
		journaliseur: { info() {}, erreur() {} }
	});
	const id = app.socle.depots.acces.creer({
		identifiant: 'camille',
		nomAffiche: 'Camille Fictive',
		role: 'tresorier',
		hash: hacheurRapide.hacher('mot-de-passe-long'),
		creeLe: instant
	});
	const tresorier: AccesConnecte = {
		id,
		identifiant: 'camille',
		nomAffiche: 'Camille Fictive',
		role: 'tresorier',
		preferences: { theme: 'systeme', raccourcis: true }
	};
	return {
		app,
		horloge,
		base,
		tresorier,
		ctx: () => app.ctx(tresorier),
		journal: () =>
			base
				.prepare('SELECT evenement, resume, acces_nom FROM journal_modification ORDER BY id')
				.all() as { evenement: string; resume: string; acces_nom: string }[]
	};
}
