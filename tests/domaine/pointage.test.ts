import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import {
	causesEcart,
	dernierConstat,
	ecart,
	ecartExplique,
	ecartNonExplique,
	elementOuvert
} from '#lib/domaine/etats/ecart.ts';
import type { Constat, GrandJournal, LigneReleveJ, OperationJ } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import {
	dateDepuisLigne,
	deciderAnnulationPointage,
	deciderPointage,
	deciderRetrait,
	differencePointage
} from '#lib/domaine/releve/pointage.ts';
import { proposer } from '#lib/domaine/releve/proposer.ts';
import { referenceLue, referencesDuLibelle, motsParlants } from '#lib/domaine/releve/references.ts';
import { comptesPointables, lignesAPointer, vuePointage } from '#lib/domaine/releve/vues.ts';
import { CCP, E2025, E2026, journal, LIVRET, operationJ, REPERE } from './aides/journal.ts';

let suivant = 100;

const ligneR = (partiel: Partial<LigneReleveJ> = {}): LigneReleveJ => ({
	id: suivant++,
	compteId: 1,
	date: '2026-10-05',
	montant: centimes(-1000),
	libelle: 'VIR FICTIF',
	doublon: 'non',
	importId: 1,
	identifiantSource: null,
	empreinte: 'e',
	...partiel
});

const constat = (solde: number, date = '2026-10-31', partiel: Partial<Constat> = {}): Constat => ({
	id: suivant++,
	compteId: 1,
	date,
	solde: centimes(solde),
	source: 'releve',
	creeLe: `${date}T10:00:00.000Z`,
	...partiel
});

const cote = (o: OperationJ) => o.cotes[0]?.id as number;

describe('ecart (§8)', () => {
	it('constaté moins calculé, au dernier constat', () => {
		const j = journal({
			operations: [operationJ({ montant: -1000 })],
			constats: [constat(90000, '2026-09-30'), constat(98000)]
		});
		expect(ecart(j, 1, '2026-10-31')).toBe(-1000);
		expect(ecart(j, 1, '2026-09-30')).toBe(-10000);
	});

	it('sans constat, ou pour les chèques à remettre : pas d’Écart', () => {
		const cheques = { ...CCP, id: 9, type: 'cheques_a_remettre' as const };
		const j = journal({ comptes: [CCP, cheques] });
		expect(ecart(j, 1, '2026-10-31')).toBeNull();
		expect(ecart(j, 9, '2026-10-31')).toBeNull();
		expect(ecartNonExplique(j, 1, '2026-10-31')).toBeNull();
		expect(ecartExplique(j, 9, '2026-10-31')).toBe(0);
	});

	it('caisse au jalon 1 : dernier constat, plus ce qui a bougé depuis', () => {
		const caisse = { ...CCP, id: 5, type: 'caisse' as const };
		const avant = operationJ({ date: '2026-10-05', montant: -1000 });
		const memeJourAvant = operationJ({ date: '2026-10-10', montant: -100 });
		const memeJourApres = operationJ({ date: '2026-10-10', montant: -200 });
		const apres = operationJ({ date: '2026-10-12', montant: -300 });
		for (const op of [avant, memeJourAvant, memeJourApres, apres]) {
			op.cotes = op.cotes.map((c) => ({ ...c, compteId: 5 }));
		}
		memeJourAvant.creeLe = '2026-10-10T08:00:00.000Z';
		memeJourApres.creeLe = '2026-10-10T12:00:00.000Z';
		const j = journal({
			comptes: [caisse],
			ancres: [{ compteId: 5, exerciceId: 2, solde: centimes(5000) }],
			operations: [avant, memeJourAvant, memeJourApres, apres],
			constats: [constat(3900, '2026-10-10', { compteId: 5, creeLe: '2026-10-10T10:00:00.000Z' })]
		});
		// 3900 − 200 − 300 pour la caisse, 5000 − 1600 pour le calcul.
		expect(ecart(j, 5, '2026-10-12')).toBe(0);
		expect(ecartExplique(j, 5, '2026-10-12')).toBe(0);
		expect(ecart({ ...j, constats: [] }, 5, '2026-10-12')).toBeNull();
	});

	it('dernierConstat départage deux constats du même jour par leur ordre', () => {
		const j = journal({
			constats: [constat(1, '2026-10-31', { id: 2 }), constat(2, '2026-10-31', { id: 3 })]
		});
		expect(dernierConstat(j, 1, '2026-10-31')?.solde).toBe(2);
	});
});

describe('elementOuvert et ecartExplique (§8)', () => {
	it('une Opération datée après son relevé garde la Ligne ouverte à cette date', () => {
		// Banque le 31/10, Opération saisie au 02/11 : relevé et calcul diffèrent, l'Écart s'explique.
		const op = operationJ({ date: '2026-11-02', montant: -1000 });
		const ligne = ligneR({ date: '2026-10-31', montant: centimes(-1000) });
		const j = journal({
			operations: [op],
			lignesReleve: [ligne],
			constats: [constat(99000)],
			pointages: [{ id: 1, compteId: 1, coteIds: [cote(op)], ligneReleveIds: [ligne.id] }]
		});
		const d = '2026-10-31';
		expect(elementOuvert(j, { type: 'ligne', id: ligne.id, date: ligne.date }, d)).toBe(true);
		expect(elementOuvert(j, { type: 'cote', id: cote(op), date: '2026-11-02' }, d)).toBe(false);
		expect(ecart(j, 1, d)).toBe(-1000);
		expect(ecartExplique(j, 1, d)).toBe(-1000);
		expect(ecartNonExplique(j, 1, d)).toBe(0);
		// Le 02/11, tout est refermé.
		expect(elementOuvert(j, { type: 'ligne', id: ligne.id, date: ligne.date }, '2026-11-02')).toBe(
			false
		);
	});

	it('un élément pointé dont tout est passé est fermé, un élément non pointé ouvert', () => {
		const op = operationJ({ date: '2026-10-05' });
		const libre = operationJ({ date: '2026-10-06' });
		const ligne = ligneR();
		const j = journal({
			operations: [op, libre],
			lignesReleve: [ligne],
			pointages: [{ id: 1, compteId: 1, coteIds: [cote(op)], ligneReleveIds: [ligne.id] }]
		});
		const d = '2026-10-31';
		expect(elementOuvert(j, { type: 'cote', id: cote(op), date: '2026-10-05' }, d)).toBe(false);
		expect(elementOuvert(j, { type: 'cote', id: cote(libre), date: '2026-10-06' }, d)).toBe(true);
		expect(elementOuvert(j, { type: 'cote', id: cote(libre), date: '2026-11-06' }, d)).toBe(false);
	});

	it('P6 : ce qui précède l’ancre n’entre pas au contrôle, car l’import ne le crée pas', () => {
		const j = journal({ constats: [constat(100000)] });
		expect(ecart(j, 1, '2026-10-31')).toBe(0);
		expect(ecartNonExplique(j, 1, '2026-10-31')).toBe(0);
	});

	it('propriété : un relevé complet s’explique toujours, quoi qu’on ait pointé', () => {
		const montants = fc.array(
			fc.integer({ min: -50000, max: 50000 }).filter((n) => n !== 0),
			{
				maxLength: 8
			}
		);
		fc.assert(
			fc.property(montants, montants, fc.nat(8), (lignes, cotes, n) => {
				const ops = cotes.map((m, i) =>
					operationJ({ id: 2000 + i, date: '2026-10-05', montant: m })
				);
				const lr = lignes.map((m, i) => ligneR({ id: 3000 + i, montant: centimes(m) }));
				const pointables = lr.filter((l, i) => i < n && ops[i]?.cotes[0]?.montant === l.montant);
				const totalLignes = lignes.reduce((a, b) => a + b, 0);
				const j = journal({
					operations: ops,
					lignesReleve: lr,
					constats: [constat(100000 + totalLignes)],
					pointages: pointables.map((l, i) => ({
						id: i + 1,
						compteId: 1,
						coteIds: [cote(ops[lr.indexOf(l)] as OperationJ)],
						ligneReleveIds: [l.id]
					}))
				});
				expect(ecartNonExplique(j, 1, '2026-10-31')).toBe(0);
			})
		);
	});
});

describe('causesEcart', () => {
	it('liste ce qui est ouvert, ce qui explique, et le plus ancien que le relevé', () => {
		const ancienne = operationJ({ date: '2026-09-02', montant: -500, libelle: 'Oubliée' });
		const recente = operationJ({ date: '2026-10-10', montant: -700, libelle: 'Récente' });
		const ligne = ligneR({ date: '2026-10-12', montant: centimes(-1200) });
		const j = journal({
			operations: [ancienne, recente],
			lignesReleve: [ligne],
			constats: [constat(98500)]
		});
		const c = causesEcart(j, 1, '2026-10-31', '2026-10-01');
		expect(c).toMatchObject({ ecart: -300, explique: 0, nonExplique: -300 });
		expect(c?.lignes.map((l) => l.id)).toEqual([ligne.id]);
		expect(c?.cotes).toHaveLength(2);
		expect(c?.anciennes.map((o) => o.operation.libelle)).toEqual(['Oubliée']);
		expect(causesEcart(journal(), 1, '2026-10-31', '2026-10-01')).toBeNull();
	});
});

describe('references', () => {
	it('lit une référence dans un libellé de relevé', () => {
		expect(referenceLue('VIR SEPA AUTOCARS FA-2026-14', 'FA-2026-14')).toBe(true);
		expect(referenceLue('VIR SEPA AUTOCARS FA 2026 14', 'fa-2026-14')).toBe(true);
		expect(referenceLue('VIR SEPA', 'FA-2026-14')).toBe(false);
	});

	it('un nombre seul doit être un mot entier', () => {
		expect(referenceLue('CHEQUE N 0001234', '1234')).toBe(true);
		expect(referenceLue('CHEQUE 91234', '1234')).toBe(false);
		expect(referenceLue('FACTURE', '12')).toBe(false);
	});

	it('repère une référence dans un libellé d’Opération', () => {
		expect(referencesDuLibelle('Autocars FA-2026-14 mars')).toEqual(['FA-2026-14']);
		expect(referencesDuLibelle('Sortie 2026')).toEqual([]);
	});

	it('garde les mots qui distinguent un mouvement', () => {
		expect(motsParlants('VIR SEPA AUTOCARS DU SUD 2026')).toEqual(['AUTOCARS']);
	});
});

describe('proposer (AD-8)', () => {
	const ligne = (partiel: Partial<LigneReleveJ> = {}) =>
		ligneR({ libelle: 'VIR SEPA AUTOCARS FA-2026-14', ...partiel });

	it('renvoie au plus 3 propositions, la meilleure en premier, avec leur raison', () => {
		const ops = [1, 2, 3, 4].map((i) =>
			operationJ({ id: 300 + i, date: `2026-10-0${i}`, libelle: `Dépense ${i}` })
		);
		const r = proposer(journal({ operations: ops }), ligne());
		expect(r).toHaveLength(3);
		expect(r.map((p) => p.operationId)).toEqual([304, 303, 302]);
		expect(r[0]?.raison).toBe('Même montant, date proche');
		expect(r[0]?.preselection).toBe(false);
		const loin = ligne({ libelle: 'CB', date: '2027-01-15' });
		expect(proposer(journal({ operations: ops }), loin)[0]?.raison).toBe('Même montant');
	});

	it('dit pourquoi : n° de facture lu dans le libellé', () => {
		const op = operationJ({ libelle: 'Autocars imaginaires', reference: 'FA-2026-14' });
		const [p] = proposer(journal({ operations: [op] }), ligne());
		expect(p?.raison).toBe('Même montant, n° de facture lu dans le libellé');
		expect(p?.preselection).toBe(true);
	});

	it('parle de chèque pour un chèque', () => {
		const op = operationJ({ reference: '1234567', modePaiement: 'cheque' });
		const [p] = proposer(journal({ operations: [op] }), ligne({ libelle: 'CHEQUE 1234567' }));
		expect(p?.raison).toBe('Même montant, n° de chèque lu dans le libellé');
		const autre = operationJ({ reference: '1234567', modePaiement: 'cheque', montant: -999 });
		const [q] = proposer(journal({ operations: [autre] }), ligne({ libelle: 'CHEQUE 1234567' }));
		expect(q?.raison).toBe('N° de chèque lu dans le libellé, montant différent');
	});

	it('une référence lue avec un autre montant reste proposée, et le dit', () => {
		const op = operationJ({ reference: 'FA-2026-14', montant: -999 });
		const [p] = proposer(journal({ operations: [op] }), ligne());
		expect(p?.raison).toBe('N° de facture lu dans le libellé, montant différent');
		expect(p?.preselection).toBe(true);
	});

	it('un montant unique est présélectionné, jamais deux', () => {
		const seule = operationJ({ libelle: 'Papeterie' });
		const [p] = proposer(journal({ operations: [seule] }), ligneR({ libelle: 'CB FICTIVE' }));
		expect(p).toMatchObject({
			raison: 'Même montant, seule Opération à ce montant',
			preselection: true
		});
		const seconde = operationJ({ libelle: 'Ramettes', date: '2026-10-06' });
		const r = proposer(
			journal({ operations: [seule, seconde] }),
			ligneR({ libelle: 'CB FICTIVE' })
		);
		expect(r.every((x) => !x.preselection)).toBe(true);
		expect(r[0]?.raison).toBe('Même montant, date proche');
	});

	it('un libellé proche se dit, avec ou sans le même montant', () => {
		const egal = operationJ({ libelle: 'Autocars du lundi', date: '2026-09-01' });
		const autre = operationJ({ libelle: 'Autocars, acompte', montant: -250, date: '2026-10-03' });
		const seconde = operationJ({ libelle: 'Sans rapport', date: '2026-10-06' });
		const r = proposer(
			journal({ operations: [egal, autre, seconde] }),
			ligne({ libelle: 'AUTOCARS' })
		);
		expect(r.map((p) => p.raison)).toContain('Même montant, libellé proche');
		expect(r.map((p) => p.raison)).toContain('Libellé proche, montant différent');
	});

	it('un Côté de Mouvement interne se propose comme « Virement vers Livret »', () => {
		const op = operationJ({
			id: 400,
			genre: 'interne',
			libelle: 'Épargne',
			cotes: [
				{ id: 401, operationId: 400, compteId: 1, date: '2026-10-05', montant: centimes(-1000) },
				{ id: 402, operationId: 400, compteId: 2, date: '2026-10-06', montant: centimes(1000) }
			],
			lignes: []
		});
		const j = journal({ operations: [op] });
		expect(proposer(j, ligneR({ libelle: 'VIR' }))[0]).toMatchObject({
			coteId: 401,
			libelle: 'Virement vers Livret'
		});
		const entree = ligneR({ compteId: 2, montant: centimes(1000), libelle: 'VIR' });
		expect(proposer(j, entree)[0]).toMatchObject({
			coteId: 402,
			libelle: 'Virement depuis CCP'
		});
	});

	it('ne propose ni un Côté pointé, ni un autre Compte, ni l’autre sens, ni un inconnu', () => {
		const pointe = operationJ({ libelle: 'Pointée' });
		const ailleurs = operationJ({ libelle: 'Ailleurs' });
		ailleurs.cotes = ailleurs.cotes.map((c) => ({ ...c, compteId: 2 }));
		const sens = operationJ({ libelle: 'Autre sens', montant: 1000 });
		const inconnue = operationJ({ libelle: 'Rien', montant: -77 });
		const j = journal({
			operations: [pointe, ailleurs, sens, inconnue],
			pointages: [{ id: 1, compteId: 1, coteIds: [cote(pointe)], ligneReleveIds: [] }]
		});
		expect(proposer(j, ligneR({ libelle: 'CB' }))).toEqual([]);
	});

	it('n’écrit rien : le journal reste identique', () => {
		const op = operationJ({ reference: 'FA-2026-14' });
		const j = journal({ operations: [op] });
		const avant = structuredClone(j);
		proposer(j, ligne());
		expect(j).toEqual(avant);
	});
});

describe('pointer : P1 à P4', () => {
	const op = () => operationJ({ montant: -1000 });
	const base = (o: OperationJ, l: LigneReleveJ, partiel: Partial<GrandJournal> = {}) =>
		journal({ operations: [o], lignesReleve: [l], ...partiel });

	it('accepte un Pointage juste', () => {
		const o = op();
		const l = ligneR();
		expect(
			deciderPointage(base(o, l), { compteId: 1, coteIds: [cote(o)], ligneIds: [l.id] }).ok
		).toBe(true);
	});

	it('accepte un Pointage N-N à somme égale', () => {
		const a = operationJ({ montant: -600 });
		const b = operationJ({ montant: -400 });
		const l1 = ligneR({ montant: centimes(-700) });
		const l2 = ligneR({ montant: centimes(-300) });
		const j = journal({ operations: [a, b], lignesReleve: [l1, l2] });
		expect(
			deciderPointage(j, { compteId: 1, coteIds: [cote(a), cote(b)], ligneIds: [l1.id, l2.id] }).ok
		).toBe(true);
	});

	it('P1 : Côté ou Ligne d’un autre Compte', () => {
		const o = op();
		o.cotes = o.cotes.map((c) => ({ ...c, compteId: 2 }));
		const l = ligneR();
		expect(
			deciderPointage(base(o, l), { compteId: 1, coteIds: [cote(o)], ligneIds: [l.id] })
		).toMatchObject({ ok: false, erreur: { code: 'pointage_incoherent' } });
		const p = op();
		const m = ligneR({ compteId: 2 });
		expect(
			deciderPointage(base(p, m), { compteId: 1, coteIds: [cote(p)], ligneIds: [m.id] })
		).toMatchObject({ ok: false, erreur: { code: 'pointage_incoherent' } });
	});

	it('P2 : une somme inégale est refusée, avec la différence', () => {
		const o = op();
		const l = ligneR({ montant: centimes(-1001) });
		const j = base(o, l);
		const d = { compteId: 1, coteIds: [cote(o)], ligneIds: [l.id] };
		expect(deciderPointage(j, d)).toMatchObject({
			ok: false,
			erreur: { code: 'pointage_desequilibre', details: { difference: -1 } }
		});
		expect(differencePointage(j, d)).toEqual({ ok: true, valeur: -1 });
	});

	it('P3 : au moins un Côté et une Ligne, sur une banque ou un livret', () => {
		const o = op();
		const l = ligneR();
		const j = base(o, l);
		for (const d of [
			{ compteId: 1, coteIds: [], ligneIds: [l.id] },
			{ compteId: 1, coteIds: [cote(o)], ligneIds: [] }
		]) {
			expect(deciderPointage(j, d)).toMatchObject({ erreur: { code: 'pointage_incoherent' } });
		}
		const caisse = { ...CCP, id: 7, type: 'caisse' as const };
		expect(
			deciderPointage(journal({ comptes: [caisse] }), { compteId: 7, coteIds: [1], ligneIds: [2] })
		).toMatchObject({ erreur: { code: 'pointage_incoherent' } });
		expect(deciderPointage(j, { compteId: 99, coteIds: [1], ligneIds: [2] })).toMatchObject({
			erreur: { code: 'pointage_incoherent' }
		});
	});

	it('P4 : une ligne à confirmer ne se pointe pas', () => {
		const o = op();
		const l = ligneR({ doublon: 'a_confirmer' });
		expect(
			deciderPointage(base(o, l), { compteId: 1, coteIds: [cote(o)], ligneIds: [l.id] })
		).toMatchObject({ erreur: { code: 'doublon_a_confirmer' } });
		const m = ligneR({ doublon: 'confirme' });
		expect(
			deciderPointage(base(o, m), { compteId: 1, coteIds: [cote(o)], ligneIds: [m.id] }).ok
		).toBe(true);
	});

	it('un élément déjà pointé ne se pointe pas deux fois', () => {
		const o = op();
		const l = ligneR();
		const autre = ligneR();
		const j = base(o, l, {
			lignesReleve: [l, autre],
			pointages: [{ id: 1, compteId: 1, coteIds: [cote(o)], ligneReleveIds: [autre.id] }]
		});
		expect(deciderPointage(j, { compteId: 1, coteIds: [cote(o)], ligneIds: [l.id] })).toMatchObject(
			{ erreur: { code: 'pointage_incoherent' } }
		);
		const p = op();
		expect(
			deciderPointage(
				journal({
					operations: [p],
					lignesReleve: [autre],
					pointages: [{ id: 2, compteId: 1, coteIds: [], ligneReleveIds: [autre.id] }]
				}),
				{ compteId: 1, coteIds: [cote(p)], ligneIds: [autre.id] }
			)
		).toMatchObject({ erreur: { code: 'pointage_incoherent' } });
	});
});

describe('deciderAnnulationPointage', () => {
	const clos = operationJ({ date: '2026-03-12' });
	const ouvert = operationJ({ date: '2026-10-05' });
	const ligneClose = ligneR({ date: '2026-03-13' });

	it('refuse si tout ce qu’il relie est dans un Exercice clôturé', () => {
		const j = journal({ operations: [clos], lignesReleve: [ligneClose] });
		const p = { id: 1, compteId: 1, coteIds: [cote(clos)], ligneReleveIds: [ligneClose.id] };
		expect(deciderAnnulationPointage(j, p)).toMatchObject({ erreur: { code: 'pointage_fige' } });
	});

	it('accepte dès qu’un élément reste dans un Exercice ouvert', () => {
		const j = journal({ operations: [ouvert], lignesReleve: [ligneClose] });
		const p = { id: 1, compteId: 1, coteIds: [cote(ouvert)], ligneReleveIds: [ligneClose.id] };
		expect(deciderAnnulationPointage(j, p).ok).toBe(true);
		expect(
			deciderAnnulationPointage(j, { id: 2, compteId: 1, coteIds: [], ligneReleveIds: [] }).ok
		).toBe(true);
	});
});

describe('P5 : retirer une Ligne de relevé', () => {
	it('refuse une Ligne pointée', () => {
		const l = ligneR({ doublon: 'a_confirmer' });
		expect(
			deciderRetrait(
				{ pointages: [{ id: 1, compteId: 1, coteIds: [], ligneReleveIds: [l.id] }] },
				l
			)
		).toMatchObject({ erreur: { code: 'ligne_releve_pointee' } });
	});

	it('une Ligne importée ne s’écarte que comme doublon', () => {
		expect(deciderRetrait({ pointages: [] }, ligneR())).toMatchObject({
			erreur: { code: 'ligne_releve_conservee' }
		});
		expect(deciderRetrait({ pointages: [] }, ligneR({ doublon: 'a_confirmer' })).ok).toBe(true);
	});

	it('une Ligne saisie à la main se retire', () => {
		expect(deciderRetrait({ pointages: [] }, ligneR({ importId: null })).ok).toBe(true);
	});
});

describe('dateDepuisLigne', () => {
	it('garde la date d’un Exercice ouvert', () => {
		expect(dateDepuisLigne([E2025, E2026], '2026-10-05')).toEqual({
			date: '2026-10-05',
			rattachementId: null
		});
	});

	it('dans un Exercice clôturé : premier jour de l’ouvert, et rattachement', () => {
		expect(dateDepuisLigne([REPERE, E2025, E2026], '2026-08-20')).toEqual({
			date: '2026-09-01',
			rattachementId: E2025.id
		});
	});

	it('sans Exercice ouvert, la date reste : la validation la refusera', () => {
		expect(dateDepuisLigne([E2025], '2026-08-20')).toEqual({
			date: '2026-08-20',
			rattachementId: null
		});
	});
});

describe('vuePointage', () => {
	const o = { aujourdhui: '2026-11-05', depuis: null, periodes: [] };

	it('range la file : non pointées d’abord, chacune par date', () => {
		const op = operationJ({ date: '2026-10-01', montant: -300 });
		const pointee = ligneR({ date: '2026-10-01', montant: centimes(-300) });
		const tardive = ligneR({ date: '2026-10-20' });
		const tot = ligneR({ date: '2026-10-02', doublon: 'a_confirmer' });
		const v = vuePointage(
			journal({
				operations: [op],
				lignesReleve: [pointee, tardive, tot],
				pointages: [{ id: 7, compteId: 1, coteIds: [cote(op)], ligneReleveIds: [pointee.id] }]
			}),
			1,
			o
		);
		expect(v.lignes.map((l) => [l.id, l.etat])).toEqual([
			[tot.id, 'a_regarder'],
			[tardive.id, 'a_pointer'],
			[pointee.id, 'pointe']
		]);
		expect(v.barre).toMatchObject({ pointees: 1, total: 3, releve: null, ecart: null });
		expect(v.lignes[2]?.relies).toMatchObject([{ operationId: op.id, montant: -300 }]);
		expect(v.dernierPointageId).toBe(7);
		expect(v.causes).toBeNull();
	});

	it('une Ligne à confirmer n’a pas de proposition (P4)', () => {
		const op = operationJ();
		const v = vuePointage(
			journal({ operations: [op], lignesReleve: [ligneR({ doublon: 'a_confirmer' })] }),
			1,
			o
		);
		expect(v.lignes[0]?.propositions).toEqual([]);
	});

	it('ne garde les pointées que depuis la date demandée, jamais les ouvertes', () => {
		const op = operationJ({ date: '2026-03-01', montant: -300 });
		const vieille = ligneR({ date: '2026-03-01', montant: centimes(-300) });
		const ouverte = ligneR({ date: '2026-03-02' });
		const v = vuePointage(
			journal({
				operations: [op],
				lignesReleve: [vieille, ouverte],
				pointages: [{ id: 1, compteId: 1, coteIds: [cote(op)], ligneReleveIds: [vieille.id] }]
			}),
			1,
			{ ...o, depuis: '2026-09-01' }
		);
		expect(v.lignes.map((l) => l.id)).toEqual([ouverte.id]);
	});

	it('la barre lit le dernier relevé et son calcul posé', () => {
		const op = operationJ({ date: '2026-10-05', montant: -1000 });
		const v = vuePointage(journal({ operations: [op], constats: [constat(101250)] }), 1, {
			...o,
			periodes: [{ id: 1, dateMin: '2026-10-01', dateMax: '2026-10-31' }]
		});
		expect(v.barre).toMatchObject({
			releve: 101250,
			dateReleve: '2026-10-31',
			calcule: 99000,
			ecart: 2250,
			depart: 100000,
			mouvements: -1000
		});
		expect(v.causes?.ecart).toBe(2250);
	});

	it('hors Exercice connu, le départ reste l’ancre', () => {
		const v = vuePointage(journal({ exercices: [] }), 1, o);
		expect(v.barre.depart).toBe(100000);
		const sansAncre = vuePointage(journal({ exercices: [], ancres: [] }), 1, o);
		expect(sansAncre.barre.depart).toBe(0);
	});

	it('remonte le dernier trou de dates', () => {
		const v = vuePointage(journal(), 1, {
			...o,
			periodes: [
				{ id: 1, dateMin: '2026-02-01', dateMax: '2026-03-03' },
				{ id: 2, dateMin: '2026-03-28', dateMax: '2026-04-30' }
			]
		});
		expect(v.trou).toEqual({ debut: '2026-03-03', fin: '2026-03-28' });
	});

	it('comptes pointables et compteur de la barre', () => {
		const caisse = { ...CCP, id: 7, type: 'caisse' as const };
		const inactif = { ...LIVRET, id: 8, actif: false };
		expect(comptesPointables({ comptes: [CCP, LIVRET, caisse, inactif] }).map((c) => c.id)).toEqual(
			[1, 2]
		);
		const a = ligneR();
		const b = ligneR();
		expect(
			lignesAPointer({
				lignesReleve: [a, b],
				pointages: [{ id: 1, compteId: 1, coteIds: [], ligneReleveIds: [a.id] }]
			})
		).toBe(1);
	});

	it('le contrôle reste juste au centime', () => {
		const j = journal({ operations: [operationJ({ montant: -1 })], constats: [constat(99999)] });
		expect(soldeCompte(j, 1, '2026-10-31')).toBe(99999);
		expect(ecart(j, 1, '2026-10-31')).toBe(0);
	});
});
