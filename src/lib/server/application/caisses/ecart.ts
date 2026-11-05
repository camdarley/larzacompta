/** Écart de caisse (C8) : son écriture, et son suivi quand un ticket en retard arrive (C11). */
import {
	deciderReouverture,
	ecartDeComptage,
	sessionDe,
	soldeAttendu,
	totalComptage
} from '#lib/domaine/caisse/index.ts';
import type { DateCivile, Instant } from '#lib/domaine/dates.ts';
import type { ComptageJ, GrandJournal } from '#lib/domaine/journal.ts';
import { centimes, type Centimes } from '#lib/domaine/montant.ts';
import type { Brouillon } from '#lib/domaine/operations/validation.ts';
import type { Compte } from '#lib/domaine/parametrage.ts';
import { succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { Outils } from '../executer.ts';
import { annulerOperation, ecrireOperation } from '../operations/index.ts';

export function natureSysteme(o: Outils, code: 'ecart_caisse' | 'recette_especes'): number {
	const nature = o.depots.parametrage.natures().find((n) => n.codeSysteme === code);
	if (nature === undefined) throw new Error(`Nature système absente : ${code}.`);
	return nature.id;
}

export function brouillonCaisse(
	compteId: number,
	date: DateCivile,
	montant: Centimes,
	o: { origine: Brouillon['origine']; libelle: string; natureId: number; actionId: number | null }
): Brouillon {
	return {
		genre: 'standard',
		origine: o.origine,
		date,
		libelle: o.libelle,
		reference: null,
		modePaiement: 'especes',
		note: null,
		tiers: null,
		sansPiece: true,
		cotes: [{ compteId, date, montant }],
		lignes: [
			{
				montant,
				estReduction: false,
				natureId: o.natureId,
				actionId: o.actionId,
				exerciceRattachementId: null,
				note: null
			}
		]
	};
}

/** C8 : Opération d'origine `ecart_caisse`, Nature système, datée du Comptage. */
export function ecrireEcart(
	o: Outils,
	compte: Pick<Compte, 'id' | 'libelle'>,
	date: DateCivile,
	ecart: Centimes
): Resultat<number | null> {
	if (ecart === 0) return succes(null);
	const cree = ecrireOperation(
		o,
		brouillonCaisse(compte.id, date, ecart, {
			origine: 'ecart_caisse',
			libelle: `Écart de caisse, ${compte.libelle}`,
			natureId: natureSysteme(o, 'ecart_caisse'),
			actionId: null
		})
	);
	return cree.ok ? succes(cree.valeur.id) : cree;
}

/** Ce que ce Comptage aurait dû constater, avec tout ce qu'on sait aujourd'hui du passé. */
function ecartAttendu(j: GrandJournal, comptage: ComptageJ): Centimes {
	const session =
		comptage.sessionCaisseId === null ? undefined : sessionDe(j, comptage.sessionCaisseId);
	const sansEcart = {
		...j,
		operations: j.operations.filter(
			(op) => op.id !== comptage.operationEcartId && op.id !== session?.operationRecetteId
		),
		comptages: j.comptages.filter(
			(c) =>
				c.id !== comptage.id &&
				(comptage.sessionCaisseId === null || c.sessionCaisseId !== comptage.sessionCaisseId)
		)
	};
	const attendu = soldeAttendu(sansEcart, comptage.compteId, {
		jour: comptage.date,
		jusqua: comptage.compteLe,
		sauf: comptage.id
	});
	return ecartDeComptage(totalComptage(comptage.coupures), attendu);
}

function remplacerEcart(o: Outils, comptage: ComptageJ, ecart: Centimes): Resultat<true> {
	if (comptage.operationEcartId !== null) {
		const annule = annulerOperation(o, comptage.operationEcartId, { parSonModule: true });
		if (!annule.ok) return annule;
		o.depots.caisses.lierEcart(comptage.id, null);
	}
	const compte = o.depots.parametrage.comptes().find((c) => c.id === comptage.compteId);
	if (compte === undefined) return succes(true);
	const ecrit = ecrireEcart(o, compte, comptage.date, ecart);
	if (!ecrit.ok) return ecrit;
	if (ecrit.valeur !== null) o.depots.caisses.lierEcart(comptage.id, ecrit.valeur);
	return succes(true);
}

/** Pour une ancre : elle change le solde attendu du tout premier Comptage de la caisse. */
export const AVANT_TOUT = '0001-01-01' as DateCivile;

export type CoteTouche = {
	compteId: number;
	date: DateCivile;
	sessionCaisseId?: number | null;
};

/** `saisiLe` : un Côté hors Session saisi avant ce Comptage, le même jour, y était déjà. */
const avantLeComptage =
	(saisiLe: Instant | undefined) =>
	(comptage: ComptageJ, cote: CoteTouche): boolean =>
		comptage.date > cote.date ||
		(comptage.date === cote.date &&
			saisiLe !== undefined &&
			(cote.sessionCaisseId ?? null) === null &&
			saisiLe <= comptage.compteLe);

/**
 * Le Comptage qui a constaté ce que ces Côtés changent : le premier qui les suit. Un Comptage final
 * ne se recalcule pas, sa Session se rouvre. Quand elle ne le peut plus, c'est le Comptage suivant
 * qui recevra la différence.
 */
function comptageConcerne(
	j: GrandJournal,
	cotes: readonly CoteTouche[],
	saisiLe: Instant | undefined
): ComptageJ | undefined {
	const estApres = avantLeComptage(saisiLe);
	const suite = j.comptages
		.filter((c) => c.compteId === cotes[0]?.compteId && cotes.some((x) => estApres(c, x)))
		.sort(
			(a, b) => a.date.localeCompare(b.date) || a.compteLe.localeCompare(b.compteLe) || a.id - b.id
		);
	const premier = suite[0];
	if (premier?.type !== 'fin') return premier;
	const session = sessionDe(j, premier.sessionCaisseId as number);
	if (session?.clotureeLe === null || deciderReouverture(j, session?.id ?? 0).ok) return undefined;
	return suite.find((c) => c.type !== 'fin');
}

/**
 * Un Côté daté avant un Comptage d'ouverture ou de contrôle ne touche pas la Recette d'espèces, mais
 * il change ce qu'on aurait dû trouver ce jour-là. L'Écart de ce Comptage se recalcule donc, sans
 * recomptage, que la Session soit ouverte ou clôturée : les billets n'ont pas bougé, seul le solde
 * attendu s'est précisé. Sans cela, `soldeCompte` garderait le ticket et s'écarterait de la caisse.
 * Les Comptages suivants repartent chacun du précédent : le premier suffit.
 */
export function reajusterEcartOuverture(
	o: Outils,
	cotes: readonly CoteTouche[],
	saisiLe?: Instant
): Resultat<true> {
	const j = o.depots.operations.journal();
	for (const compteId of new Set(cotes.map((c) => c.compteId))) {
		const comptage = comptageConcerne(
			j,
			cotes.filter((c) => c.compteId === compteId),
			saisiLe
		);
		if (comptage === undefined) continue;
		const lie = j.operations.find((op) => op.id === comptage.operationEcartId);
		const ecart = ecartAttendu(j, comptage);
		if (ecart === centimes(lie?.cotes[0]?.montant ?? 0)) continue;
		const r = remplacerEcart(o, comptage, ecart);
		if (!r.ok) return r;
	}
	return succes(true);
}
