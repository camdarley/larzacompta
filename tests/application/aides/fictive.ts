import { centimes } from '#lib/domaine/montant.ts';
import type { EntreeCreation } from '#lib/server/application/operations/index.ts';
import { PARAMETRES, saisiesFictives } from '../../jeux/exercice-fictif.ts';
import { banc } from './app.ts';

const c = centimes;

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

/** Instance prête, Natures et Actions de l'APE imaginaire dans le premier Groupe. */
export function instanceFictive(instant = '2026-11-04T10:00:00.000Z') {
	const b = banc(instant);
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
			comptes: PARAMETRES.comptes.map((x) => ({ libelle: x.libelle, type: x.type, solde: x.solde }))
		})
	);
	const depot = b.app.socle.depots.parametrage;
	const groupe = depot.groupes()[0]!.id;
	for (const libelle of PARAMETRES.natures) {
		valeur(b.app.parametrage.creerNature(ctx, { libelle, groupeId: groupe, neutre: false }));
	}
	for (const libelle of PARAMETRES.actions) {
		valeur(b.app.parametrage.creerAction(ctx, { libelle, groupeId: groupe, avecCaisse: false }));
	}
	const nature = (nom: string) => depot.natures().find((n) => n.libelle === nom)!.id;
	const action = (nom: string) => depot.actions().find((a) => a.libelle === nom)!.id;
	const comptes = depot.comptes();
	const reperes = {
		banque: comptes[0]!.id,
		livret: comptes[1]!.id,
		nature,
		action,
		sommeARendre: depot.natures().find((n) => n.codeSysteme === 'somme_a_rendre')!.id
	};
	const exercice = (libelle: string) =>
		b.app.socle.depots.exercices.lister().find((e) => e.libelle === libelle)!;
	return { ...b, ...reperes, reperes, exercice };
}

export type InstanceFictive = ReturnType<typeof instanceFictive>;

export function depenseSimple(i: InstanceFictive, partiel: Partial<EntreeCreation> = {}) {
	return {
		forme: 'standard',
		intention: 'depense',
		libelle: 'Papeterie fictive',
		reference: null,
		modePaiement: 'virement',
		note: null,
		tiers: null,
		compteId: i.banque,
		date: '2026-10-05',
		montant: c(100_00),
		lignes: [
			{
				montant: c(100_00),
				contraire: false,
				reduction: false,
				natureId: i.nature('Transport'),
				actionId: null,
				exerciceRattachementId: null,
				note: null
			}
		],
		...partiel
	} as EntreeCreation;
}

export function creerOperation(i: InstanceFictive, e: EntreeCreation): number {
	return valeur(i.app.operations.creer(i.ctx(), e)).id;
}

/** Tous les cas de l'analyse d'origine, dans l'ordre de l'année, trop-perçu rendu compris. */
export function jouerExerciceFictif(i: InstanceFictive) {
	const ids = new Map(saisiesFictives(i.reperes).map((s) => [s.cas, creerOperation(i, s)]));
	const recue = [...ids].find(([cas]) => cas.startsWith('FR-8 : trop-perçu'))![1];
	creerOperation(i, {
		...depenseSimple(i, {
			date: '2026-11-30',
			libelle: 'Trop-perçu rendu',
			lignes: [
				{
					montant: c(100_00),
					contraire: false,
					reduction: false,
					natureId: i.sommeARendre,
					actionId: null,
					exerciceRattachementId: null,
					note: null
				}
			]
		} as Partial<EntreeCreation>),
		rendDe: recue
	} as EntreeCreation);
	return ids;
}
