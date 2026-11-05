import { centimes } from '#lib/domaine/montant.ts';
import type { EntreeOperation } from '#lib/server/application/operations/index.ts';
import { banc } from './app.ts';

export function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

/** Instance prête : 2026-2027 ouvert, repère 2025-2026, un Compte, une Nature, une Action. */
export function instancePrete() {
	const b = banc('2026-11-04T10:00:00.000Z');
	const ctx = b.ctx();
	valeur(
		b.app.parametrage.enregistrerAssociation(ctx, {
			nom: 'APE des Tilleuls',
			adresse: '',
			moisDebutExercice: 9,
			mentionsFacture: ''
		})
	);
	valeur(
		b.app.exercices.demarrer(ctx, {
			anneeDebut: 2026,
			comptes: [{ libelle: 'CCP', type: 'banque', solde: centimes(1000_00) }]
		})
	);
	const p = b.app.socle.depots.parametrage;
	const groupeId = p.groupes()[0]!.id;
	valeur(b.app.parametrage.creerNature(ctx, { libelle: 'Papeterie', groupeId, neutre: false }));
	valeur(b.app.parametrage.creerAction(ctx, { libelle: 'Kermesse', groupeId, avecCaisse: false }));
	const natureId = p.natures().find((n) => n.libelle === 'Papeterie')!.id;
	const actionId = p.actions().find((a) => a.libelle === 'Kermesse')!.id;
	const compteId = p.comptes()[0]!.id;
	const exercices = () => b.app.socle.depots.exercices.lister();
	return {
		...b,
		compteId,
		natureId,
		actionId,
		repere: exercices().find((e) => e.statut === 'repere')!,
		courant: exercices().find((e) => e.statut === 'ouvert')!,
		saisie(
			sens: 'depense' | 'recette',
			montant: number,
			partiel: Partial<Extract<EntreeOperation, { forme: 'standard' }>> = {}
		): Extract<EntreeOperation, { forme: 'standard' }> {
			return {
				forme: 'standard',
				intention: sens,
				libelle: 'Papeterie fictive',
				reference: null,
				modePaiement: 'virement',
				note: null,
				tiers: null,
				compteId,
				date: '2026-10-05',
				montant: centimes(montant),
				lignes: [
					{
						montant: centimes(montant),
						contraire: false,
						reduction: false,
						natureId,
						actionId: null,
						exerciceRattachementId: null,
						note: null
					}
				],
				...partiel
			};
		}
	};
}
