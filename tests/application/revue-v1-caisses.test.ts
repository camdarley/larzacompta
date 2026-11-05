/**
 * Non-régression de la revue indépendante de la v1, côté caisses. Après chaque scénario, le solde
 * comptable, le solde courant et l'argent réellement présent disent la même chose.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { soldeCourantCaisse, termesRecette } from '#lib/domaine/caisse/index.ts';
import { recettesARevoir } from '#lib/domaine/caisse/saisie.ts';
import { ecart } from '#lib/domaine/etats/ecart.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import type { CoupureJ, PhaseSession } from '#lib/domaine/journal.ts';
import { centimes as c, type Centimes } from '#lib/domaine/montant.ts';
import { instancePrete, valeur } from './aides/instance.ts';

let i: ReturnType<typeof instancePrete>;
let caisse: number;
let reserve: number;

const j = () => i.app.socle.depots.operations.journal();
const verifier = () => valeur(i.app.etats.verifier(i.ctx())).map((v) => v.message);
const quand = (jour: string, heure = '18:00:00') => {
	i.horloge.instant = `${jour}T${heure}.000Z`;
};
const billets = (n: number): CoupureJ[] => [{ coupure: c(1000), quantite: n }];
const recette = (s: number) => termesRecette(j(), s)?.recette;

function creerCaisse(libelle: string, solde: number, estReserve = false) {
	return valeur(
		i.app.parametrage.creerCompte(i.ctx(), {
			libelle,
			type: 'caisse',
			reserve: estReserve,
			ancre: { exerciceId: i.courant.id, solde: c(solde) }
		})
	);
}

function ouvrir(n: number, date: string, confirmation: Centimes | null = null) {
	const r = i.app.caisses.compterCaisse(i.ctx(), {
		compteId: caisse,
		actionId: i.actionId,
		coupures: billets(n),
		date,
		confirmation
	});
	return valeur(r).sessionId as number;
}

const compter = (
	id: number,
	n: number,
	date: string,
	corriger = false,
	confirmation: Centimes | null = null
) =>
	i.app.caisses.compterSession(i.ctx(), {
		sessionId: id,
		coupures: billets(n),
		date,
		confirmation,
		corriger
	});

function clore(id: number, n: number, date: string) {
	valeur(compter(id, n, date));
	valeur(i.app.caisses.cloturer(i.ctx(), id));
}

function depense(
	montant: number,
	date: string,
	compteId = caisse,
	phases?: Record<string, PhaseSession>
) {
	return valeur(
		i.app.operations.creer(i.ctx(), {
			...i.saisie('depense', montant, { compteId, date, modePaiement: 'especes' }),
			phases
		})
	).id;
}

function corriger(id: number, montant: number, date: string) {
	const op = i.app.socle.depots.operations.parId(id);
	return i.app.operations.modifier(i.ctx(), {
		id,
		version: op?.version ?? 0,
		saisie: i.saisie('depense', montant, { compteId: caisse, date, modePaiement: 'especes' })
	});
}

const cote = (id: number) => i.app.socle.depots.operations.parId(id)?.cotes[0];

function juste(jour: string, attendu: number, compteId = caisse) {
	expect(soldeCompte(j(), compteId, jour)).toBe(attendu);
	expect(soldeCourantCaisse(j(), compteId, { jour })).toBe(attendu);
	expect(ecart(j(), compteId, jour)).toBe(0);
	expect(verifier()).toEqual([]);
}

beforeEach(() => {
	i = instancePrete();
	quand('2026-09-15');
	valeur(
		i.app.parametrage.modifierAction(i.ctx(), {
			id: i.actionId,
			libelle: 'Kermesse',
			groupeId: i.app.socle.depots.parametrage.groupes()[0]?.id as number,
			avecCaisse: true
		})
	);
	caisse = creerCaisse('Caisse', 100_00);
	reserve = creerCaisse('Réserve', 200_00, true);
});

describe('un ticket du jour du Comptage final, saisi après la clôture', () => {
	function sessionClose() {
		quand('2026-10-10');
		const s = ouvrir(10, '2026-10-10');
		clore(s, 30, '2026-10-10');
		quand('2026-10-12');
		return s;
	}

	it('ne se tait pas : sans réponse, la Recette est à revoir au Tableau de contrôle', () => {
		const s = sessionClose();
		depense(20_00, '2026-10-10');
		expect(recettesARevoir(j()).map((r) => r.sessionId)).toEqual([s]);
		const t = valeur(i.app.etats.tableau(i.ctx(), i.courant));
		expect(t.taches.find((x) => x.id === 'recettes')?.compteur).toBe(1);
		expect(t.bilan.type).not.toBe('a_jour');
		expect(valeur(i.app.caisses.session(i.ctx(), s)).aRattacher).toHaveLength(1);
	});

	it('entre dans la Session rouverte, qui recalcule la Recette', () => {
		const s = sessionClose();
		const t = depense(20_00, '2026-10-10');
		valeur(i.app.caisses.rouvrir(i.ctx(), s));
		expect(cote(t)).toMatchObject({ sessionCaisseId: s, sessionPhase: 'pendant' });
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		expect(recette(s)).toBe(220_00);
		expect(recettesARevoir(j())).toEqual([]);
		juste('2026-10-12', 300_00);
	});

	it('la réponse « après le Comptage » se garde, sans toucher à la Recette', () => {
		const s = sessionClose();
		const t = depense(20_00, '2026-10-10', caisse, { [caisse]: 'apres_comptage' });
		expect(cote(t)).toMatchObject({ sessionCaisseId: s, sessionPhase: 'apres_comptage' });
		expect(recettesARevoir(j())).toEqual([]);
		expect(recette(s)).toBe(200_00);
		juste('2026-10-12', 280_00);
	});

	it('un dépôt du même jour part après le Comptage : rien à revoir', () => {
		sessionClose();
		valeur(
			i.app.operations.creer(i.ctx(), {
				forme: 'interne',
				libelle: 'Dépôt',
				note: null,
				reference: null,
				deId: caisse,
				versId: i.compteId,
				montant: c(100_00),
				parti: '2026-10-10',
				arrive: '2026-10-10'
			})
		);
		expect(recettesARevoir(j())).toEqual([]);
		juste('2026-10-12', 200_00);
	});
});

describe('un mouvement arrivé derrière un Comptage trouve toujours une issue', () => {
	it('un ticket daté pendant une Session close entre à la réouverture, l’Écart disparaît', () => {
		quand('2026-10-10');
		const s = ouvrir(10, '2026-10-10');
		quand('2026-10-12');
		clore(s, 30, '2026-10-12');
		quand('2026-10-15');
		depense(20_00, '2026-10-11');
		expect(ecart(j(), caisse, '2026-10-15')).toBe(20_00);
		expect(recettesARevoir(j())).toHaveLength(1);
		valeur(i.app.caisses.rouvrir(i.ctx(), s));
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		expect(recette(s)).toBe(220_00);
		juste('2026-10-15', 300_00);
		quand('2026-10-20');
		const s2 = ouvrir(30, '2026-10-20');
		clore(s2, 30, '2026-10-20');
		juste('2026-10-20', 300_00);
	});

	it('une Session qui ne se rouvre plus : l’ouverture suivante reçoit la différence', () => {
		quand('2026-10-10');
		const s = ouvrir(10, '2026-10-10');
		quand('2026-10-12');
		clore(s, 30, '2026-10-12');
		quand('2026-10-14');
		const s2 = ouvrir(30, '2026-10-14');
		quand('2026-10-15');
		depense(20_00, '2026-10-11');
		expect(recettesARevoir(j())).toEqual([]);
		clore(s2, 30, '2026-10-15');
		juste('2026-10-15', 300_00);
	});

	it('réserve : un ticket antérieur ajuste l’Écart du contrôle qui l’a suivi', () => {
		const compterReserve = (n: number, date: string, confirmation: Centimes | null = null) =>
			i.app.caisses.compterCaisse(i.ctx(), {
				compteId: reserve,
				coupures: billets(n),
				date,
				confirmation
			});
		quand('2026-10-10');
		valeur(compterReserve(20, '2026-10-10'));
		quand('2026-10-12');
		depense(20_00, '2026-10-09', reserve);
		juste('2026-10-12', 200_00, reserve);
		quand('2026-10-20');
		expect(valeur(compterReserve(20, '2026-10-20')).ecart).toBe(0);
		juste('2026-10-20', 200_00, reserve);
	});

	it('une ancre corrigée après une Session se retrouve dans l’Écart de son ouverture', () => {
		quand('2026-10-10');
		const s = ouvrir(10, '2026-10-10');
		clore(s, 30, '2026-10-10');
		quand('2026-10-12');
		valeur(
			i.app.exercices.enregistrerBalance(i.ctx(), {
				exerciceId: i.courant.id,
				soldes: [{ compteId: caisse, solde: c(120_00) }]
			})
		);
		juste('2026-10-12', 300_00);
	});

	it('annuler un ticket hors Session antérieur au repère ne laisse aucun Écart', () => {
		const ticket = (() => {
			quand('2026-10-05');
			return depense(20_00, '2026-10-05');
		})();
		quand('2026-10-10');
		const s = ouvrir(8, '2026-10-10');
		clore(s, 18, '2026-10-10');
		quand('2026-10-12');
		valeur(i.app.operations.annuler(i.ctx(), ticket));
		juste('2026-10-12', 180_00);
	});

	it('sans Comptage à recalculer, le Comptage suivant compare au solde comptable', () => {
		// Ticket daté du jour d'un contrôle, saisi après : hors de ce que ce Comptage a vu.
		const compterReserve = (n: number, date: string, confirmation: Centimes | null = null) =>
			i.app.caisses.compterCaisse(i.ctx(), {
				compteId: reserve,
				coupures: billets(n),
				date,
				confirmation
			});
		quand('2026-10-10');
		valeur(compterReserve(20, '2026-10-10'));
		quand('2026-10-11');
		depense(20_00, '2026-10-10', reserve);
		juste('2026-10-11', 180_00, reserve);
		quand('2026-10-20');
		const r = compterReserve(18, '2026-10-20');
		expect(valeur(r).ecart).toBe(0);
		juste('2026-10-20', 180_00, reserve);
	});
});

describe('un ticket saisi avant l’ouverture', () => {
	it('reste dans le Fond quand on le corrige pendant la Session', () => {
		quand('2026-10-10', '09:00:00');
		const t = depense(20_00, '2026-10-10');
		quand('2026-10-10', '10:00:00');
		const s = ouvrir(8, '2026-10-10');
		quand('2026-10-10', '12:00:00');
		valeur(corriger(t, 25_00, '2026-10-10'));
		expect(cote(t)?.sessionCaisseId ?? null).toBeNull();
		quand('2026-10-10');
		clore(s, 18, '2026-10-10');
		expect(recette(s)).toBe(100_00);
		juste('2026-10-10', 180_00);
	});

	it('reste dehors quand sa date est ramenée au jour de l’ouverture', () => {
		quand('2026-10-08');
		const t = depense(20_00, '2026-10-08');
		quand('2026-10-10', '10:00:00');
		const s = ouvrir(8, '2026-10-10');
		quand('2026-10-10', '12:00:00');
		valeur(corriger(t, 20_00, '2026-10-10'));
		expect(cote(t)?.sessionCaisseId ?? null).toBeNull();
		quand('2026-10-10');
		clore(s, 18, '2026-10-10');
		expect(recette(s)).toBe(100_00);
		juste('2026-10-10', 180_00);
	});
});

describe('une ouverture antidatée recouvre ce qui suit sa date', () => {
	it('à la création : un ticket saisi avant entre dans la Session', () => {
		quand('2026-10-11');
		const t = depense(20_00, '2026-10-11');
		quand('2026-10-12');
		const s = ouvrir(10, '2026-10-10');
		expect(cote(t)?.sessionCaisseId).toBe(s);
		clore(s, 28, '2026-10-12');
		expect(recette(s)).toBe(200_00);
		juste('2026-10-12', 280_00);
	});

	it('à la correction : le ticket n’est plus dans le solde attendu, il entre', () => {
		quand('2026-10-09');
		const t = depense(20_00, '2026-10-09');
		quand('2026-10-10');
		const s = ouvrir(8, '2026-10-10');
		expect(cote(t)?.sessionCaisseId ?? null).toBeNull();
		valeur(compter(s, 8, '2026-10-08', true, c(80_00)));
		expect(cote(t)?.sessionCaisseId).toBe(s);
		clore(s, 8, '2026-10-10');
		juste('2026-10-10', 80_00);
	});
});

it('deux Sessions le même jour : un Écart recalculé ne devient pas fantôme', () => {
	quand('2026-10-10', '09:00:00');
	const s1 = ouvrir(10, '2026-10-10');
	quand('2026-10-10', '12:00:00');
	clore(s1, 30, '2026-10-10');
	quand('2026-10-10', '14:00:00');
	const s2 = ouvrir(30, '2026-10-10');
	quand('2026-10-10', '18:00:00');
	clore(s2, 50, '2026-10-10');
	quand('2026-10-12');
	depense(20_00, '2026-10-05');
	juste('2026-10-12', 500_00);
	quand('2026-10-20');
	expect(ouvrir(50, '2026-10-20')).toBeGreaterThan(s2);
});
