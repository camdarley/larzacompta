/** Ce que seules les couches supérieures exerçaient : le domaine se prouve aussi seul (AD-23). */
import { describe, expect, it } from 'vitest';
import { coteFigeParSession, rattachementsARevoir } from '#lib/domaine/caisse/saisie.ts';
import { noeudAnterieur, noeudSansAction } from '#lib/domaine/etats/arbre.ts';
import {
	cheminFacture,
	csvBudget,
	csvFactures,
	listePiecesManquantes
} from '#lib/domaine/etats/export-complet.ts';
import type { Facture } from '#lib/domaine/factures/index.ts';
import type { GrandJournal, OperationJ } from '#lib/domaine/journal.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import { comptesPointables, lignesAPointer, phraseEcartees } from '#lib/domaine/releve/vues.ts';

const facture = (partiel: Partial<Facture>): Facture =>
	({
		id: 1,
		type: 'facture',
		numero: '2026-001',
		avoirDeId: null,
		tiersNom: 'Cantine fictive',
		tiersAdresse: '1 rue Fictive',
		dateEmission: '2026-11-02',
		lignes: [{ designation: 'Repas', quantite: 2, prixUnitaire: c(5_00) }],
		...partiel
	}) as Facture;

describe('export complet', () => {
	it('un Avoir se classe à part, et renvoie à la Facture annulée', () => {
		const validee = facture({});
		const avoir = facture({ id: 2, type: 'avoir', numero: '2026-002', avoirDeId: 1 });
		expect(cheminFacture(validee)).toBe('factures/facture-2026-001.pdf');
		expect(cheminFacture(avoir)).toBe('factures/avoir-2026-002.pdf');
		const { lignes } = csvFactures([validee, avoir, facture({ id: 3, numero: null })]);
		expect(lignes[0]?.slice(0, 2)).toEqual(['2026-001', 'Facture']);
		expect(lignes[1]?.[1]).toBe('Avoir');
		expect(lignes[1]?.[7]).toBe('2026-001');
		expect(lignes[2]?.[6]).toBe('Brouillon');
	});

	it('le Budget nomme Exercice, Action et Nature, et une ligne sans Action le dit', () => {
		const table = csvBudget(
			[
				{ exerciceId: 1, actionId: 2, natureId: 3, sens: 'recette', montant: c(10_00) },
				{ exerciceId: 1, actionId: null, natureId: 3, sens: 'depense', montant: c(4_00) }
			],
			[{ id: 1, libelle: '2026-2027' }],
			{
				actions: [{ id: 2, libelle: 'Kermesse' }],
				natures: [{ id: 3, libelle: 'Buvette' }]
			} as never
		);
		expect(table.lignes[0]?.slice(0, 4)).toEqual(['2026-2027', 'Kermesse', 'Buvette', 'Recette']);
		expect(table.lignes[1]?.slice(1, 4)).toEqual(['Sans Action', 'Buvette', 'Dépense']);
	});

	it('la liste des Pièces manquantes n’existe que s’il en manque, accordée au nombre', () => {
		expect(listePiecesManquantes([])).toBeNull();
		expect(listePiecesManquantes(['a.pdf'])).toContain('Cette Pièce manque');
		expect(listePiecesManquantes(['a.pdf', 'b.pdf'])).toContain('Ces Pièces manquent');
	});
});

describe('arbres des états', () => {
	const totaux = { recettes: c(10_00), depenses: c(4_00), resultat: c(6_00) };
	const nature = {
		id: 1,
		libelle: 'Buvette',
		...totaux,
		lignes: []
	} as never;

	it('« Sans Action » range ses Natures sous une clé à part', () => {
		const n = noeudSansAction([nature], totaux);
		expect(n.libelle).toBe('Sans Action');
		expect(n.enfants).toHaveLength(1);
		expect(n.enfants[0]?.cle.startsWith('s')).toBe(true);
	});

	it('le bloc antérieur préfixe toutes ses clés, à chaque niveau', () => {
		const n = noeudAnterieur({
			id: 1,
			libelle: 'Évènements',
			...totaux,
			actions: [],
			sansAction: [nature]
		} as never);
		expect(n.cle.startsWith('x-')).toBe(true);
		expect(n.enfants.every((e) => e.cle.startsWith('x-'))).toBe(true);
	});
});

describe('rattachements de caisse', () => {
	const cote = (id: number, date: string, sessionCaisseId: number | null) => ({
		id,
		compteId: 1,
		date,
		montant: c(5_00),
		sessionCaisseId,
		sessionPhase: sessionCaisseId === null ? null : 'pendant'
	});
	const operation = (
		cotes: ReturnType<typeof cote>[],
		creeLe = '2026-11-02T10:00:00.000Z'
	): OperationJ => ({ origine: 'standard', creeLe, cotes }) as unknown as OperationJ;
	const session = { id: 7, compteId: 1, ouverteLe: '2026-11-01T10:00:00.000Z' };

	it('C12 : un Côté daté avant l’ouverture corrigée sort, un Côté daté après y entre', () => {
		const j = {
			operations: [
				operation([cote(1, '2026-11-01', 7)]),
				operation([cote(2, '2026-11-05', null)]),
				operation([cote(3, '2026-11-05', null)], '2026-10-01T10:00:00.000Z'),
				operation([{ ...cote(4, '2026-11-05', null), compteId: 2 }]),
				operation([cote(5, '2026-11-03', null)], '2026-10-01T10:00:00.000Z')
			]
		};
		expect(rattachementsARevoir(j, session, '2026-11-03')).toEqual([
			{ coteId: 1, sessionCaisseId: null, sessionPhase: null },
			{ coteId: 2, sessionCaisseId: 7, sessionPhase: 'pendant' },
			// Daté après la date posée : le solde attendu de ce jour ne pouvait pas le contenir.
			{ coteId: 3, sessionCaisseId: 7, sessionPhase: 'pendant' }
		]);
	});

	it('une Session clôturée fige ses Côtés, pas le texte ni une Session ouverte', () => {
		const sessions = [
			{ id: 7, clotureeLe: '2026-11-02T10:00:00.000Z' },
			{ id: 8, clotureeLe: null }
		] as unknown as GrandJournal['sessions'];
		const avant = operation([cote(1, '2026-11-01', 7)]);
		const j = { sessions };
		const meme = [{ compteId: 1, date: '2026-11-01', montant: c(5_00) }] as never;
		const autre = [{ compteId: 1, date: '2026-11-01', montant: c(6_00) }] as never;
		expect(coteFigeParSession(j, avant, meme)).toBe(false);
		expect(coteFigeParSession(j, avant, autre)).toBe(true);
		expect(coteFigeParSession(j, operation([cote(1, '2026-11-01', 8)]), autre)).toBe(false);
		expect(coteFigeParSession(j, operation([cote(1, '2026-11-01', null)]), autre)).toBe(false);
	});
});

describe('vues du Pointage', () => {
	it('dit combien de lignes ont été écartées, au singulier comme au pluriel', () => {
		expect(phraseEcartees(1)).toMatch(/1 ligne/);
		expect(phraseEcartees(3)).toMatch(/3 lignes/);
	});

	it('ne propose que les Comptes à relevé, et compte les lignes non pointées', () => {
		const comptes = comptesPointables({
			comptes: [
				{ id: 1, libelle: 'Banque', type: 'banque', actif: true },
				{ id: 2, libelle: 'Caisse', type: 'caisse', actif: true }
			]
		} as never);
		expect(comptes.map((x) => x.id)).toEqual([1]);
		expect(
			lignesAPointer({
				lignesReleve: [{ id: 1 }, { id: 2 }],
				pointages: [{ id: 1, ligneReleveIds: [1], creeLe: '2026-11-01T10:00:00.000Z' }]
			} as never)
		).toBe(1);
	});
});
