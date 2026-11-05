import { describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import { ATTENDUS } from '../jeux/exercice-fictif.ts';
import {
	creerOperation,
	depenseSimple,
	instanceFictive,
	jouerExerciceFictif
} from './aides/fictive.ts';

const c = centimes;

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

describe('jeu fictif complet (5.1)', () => {
	it('donne ses résultats au centime', () => {
		const i = instanceFictive();
		jouerExerciceFictif(i);
		const e = i.exercice('2026-2027');
		const { resultat, anomalies } = valeur(i.app.etats.compteDeResultat(i.ctx(), e));
		expect(resultat.recettes).toBe(ATTENDUS.recettes);
		expect(resultat.depenses).toBe(ATTENDUS.depenses);
		expect(resultat.resultat).toBe(ATTENDUS.resultat);
		expect(anomalies).toEqual([]);

		const { etat } = valeur(i.app.etats.tresorerie(i.ctx(), e));
		expect(etat.variation).toBe(ATTENDUS.variation);
		expect(etat.fin).toBe(ATTENDUS.soldeBanqueFin + ATTENDUS.soldeLivretFin);
		expect(etat.explication.difference).toBe(0);

		const actions = valeur(i.app.etats.actions(i.ctx(), e));
		const parNom = Object.fromEntries(
			actions.resultat.groupes.flatMap((g) => g.actions).map((a) => [a.libelle, a.resultat])
		);
		expect(parNom).toEqual(ATTENDUS.resultatParAction);
		expect(actions.resultat.resultat).toBe(ATTENDUS.resultat);
		expect(actions.resultatExercice).toBe(ATTENDUS.resultat);
	});

	it('explique un paiement rattaché à l’Exercice antérieur, hors résultat', () => {
		const i = instanceFictive();
		const repere = i.exercice('2025-2026');
		creerOperation(i, {
			...depenseSimple(i),
			lignes: [
				{
					montant: c(100_00),
					contraire: false,
					reduction: false,
					natureId: i.nature('Transport'),
					actionId: null,
					exerciceRattachementId: repere.id,
					note: null
				}
			]
		} as never);
		const e = i.exercice('2026-2027');
		const { resultat } = valeur(i.app.etats.compteDeResultat(i.ctx(), e));
		expect(resultat.resultat).toBe(0);
		expect(resultat.anterieurs.resultat).toBe(-100_00);
		const { etat } = valeur(i.app.etats.tresorerie(i.ctx(), e));
		expect(etat.explication).toMatchObject({
			anterieures: -100_00,
			variation: -100_00,
			difference: 0
		});
	});

	it('une équation fausse donne une anomalie à afficher, et garde les chiffres', () => {
		const i = instanceFictive();
		const id = creerOperation(i, depenseSimple(i));
		i.base.exec(`UPDATE ligne SET montant_centimes = -9000 WHERE operation_id = ${id}`);
		const e = i.exercice('2026-2027');
		const { resultat, anomalies } = valeur(i.app.etats.compteDeResultat(i.ctx(), e));
		expect(anomalies[0]).toMatch(/diffèrent de 10,00/);
		expect(resultat.resultat).toBe(-90_00);
	});
});

describe('page d’Action', () => {
	it('partage les données de l’écran Actions', () => {
		const i = instanceFictive();
		jouerExerciceFictif(i);
		const e = i.exercice('2026-2027');
		const k = valeur(i.app.etats.action(i.ctx(), e, i.action('Kermesse')));
		expect(k.action?.resultat).toBe(ATTENDUS.resultatParAction.Kermesse);
		expect(k.groupe).not.toBe('');
		const r = i.app.etats.action(i.ctx(), e, 9999);
		expect(!r.ok && r.erreur.code).toBe('element_introuvable');
	});
});

describe('Tableau de contrôle', () => {
	it('dit d’importer le premier relevé, sans dire que tout est à jour', () => {
		const i = instanceFictive();
		const e = i.exercice('2026-2027');
		const t = valeur(i.app.etats.tableau(i.ctx(), e));
		expect(t.premierReleve).toBe(true);
		expect(t.bilan).toEqual({ type: 'premier_releve' });
		expect(t.cartes.map((x) => x.compte.libelle)).toEqual([
			'Banque des Tilleuls',
			'Livret des Tilleuls'
		]);
	});

	it('compte les Pièces manquantes dans À faire', () => {
		const i = instanceFictive();
		creerOperation(i, depenseSimple(i));
		const t = valeur(i.app.etats.tableau(i.ctx(), i.exercice('2026-2027')));
		expect(t.taches.find((x) => x.id === 'pieces')?.compteur).toBe(1);
		expect(t.bilan).toEqual({ type: 'taches', nombre: 1 });
	});

	it('signale un solde constaté qui ne tombe pas juste', () => {
		const i = instanceFictive();
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: i.banque,
				date: '2026-10-31',
				solde: c(1100_00)
			})
		);
		const t = valeur(i.app.etats.tableau(i.ctx(), i.exercice('2026-2027')));
		expect(t.bilan).toEqual({ type: 'ecart', comptes: 1 });
		expect(t.cartes[0]?.phraseEcart).toMatch(/^Écart de 100,00/);
	});

	it('repère une Opération non pointée antérieure au dernier relevé', () => {
		const i = instanceFictive();
		const id = creerOperation(i, depenseSimple(i, { date: '2026-09-10' } as never));
		const e = i.exercice('2026-2027');
		i.base.exec(`
			INSERT INTO import_releve
				(id, compte_id, source, nom_fichier, fichier_sha256, date_min, date_max, nb_lues, nb_nouvelles, nb_connues, importe_le, importe_par)
			VALUES (1, ${i.banque}, 'ofx', 'r.ofx', 'x', '2026-10-01', '2026-10-31', 0, 0, 0, '2026-11-01T10:00:00.000Z', ${i.tresorier.id});
		`);
		expect(valeur(i.app.etats.anciennes(i.ctx(), e))).toEqual([id]);
	});
});

describe('droits', () => {
	it('refuse les états à qui n’a pas le droit de consulter', () => {
		const i = instanceFictive();
		const e = i.exercice('2026-2027');
		const anonyme = i.app.ctx(null);
		expect(i.app.etats.tableau(anonyme, e).ok).toBe(false);
		expect(i.app.etats.compteDeResultat(anonyme, e).ok).toBe(false);
		expect(i.app.etats.exportComplet(anonyme).ok).toBe(false);
	});
});
