/** Écart de caisse (C8) : son écriture, et son suivi quand un ticket en retard arrive (C11). */
import { ecartDeComptage, soldeCourantCaisse, totalComptage } from '#lib/domaine/caisse/index.ts';
import type { DateCivile } from '#lib/domaine/dates.ts';
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

/** Ce que l'ouverture aurait dû constater, avec tout ce qu'on sait aujourd'hui du passé. */
function ecartAttendu(j: GrandJournal, ouverture: ComptageJ): Centimes {
	const sansEcart = {
		...j,
		operations: j.operations.filter((op) => op.id !== ouverture.operationEcartId),
		comptages: j.comptages.filter((c) => c.sessionCaisseId !== ouverture.sessionCaisseId)
	};
	const attendu = soldeCourantCaisse(sansEcart, ouverture.compteId, {
		jour: ouverture.date,
		jusqua: ouverture.compteLe,
		sauf: ouverture.id
	});
	return ecartDeComptage(totalComptage(ouverture.coupures), attendu);
}

function remplacerEcart(o: Outils, ouverture: ComptageJ, ecart: Centimes): Resultat<true> {
	if (ouverture.operationEcartId !== null) {
		const annule = annulerOperation(o, ouverture.operationEcartId, { parSonModule: true });
		if (!annule.ok) return annule;
		o.depots.caisses.lierEcart(ouverture.id, null);
	}
	const compte = o.depots.parametrage.comptes().find((c) => c.id === ouverture.compteId);
	if (compte === undefined) return succes(true);
	const ecrit = ecrireEcart(o, compte, ouverture.date, ecart);
	if (!ecrit.ok) return ecrit;
	if (ecrit.valeur !== null) o.depots.caisses.lierEcart(ouverture.id, ecrit.valeur);
	return succes(true);
}

/** Le premier Comptage après ce jour : c'est lui qui a constaté ce que ce Côté a changé. */
function premierComptageApres(
	j: Pick<GrandJournal, 'comptages'>,
	compteId: number,
	date: DateCivile
): ComptageJ | undefined {
	return j.comptages
		.filter((c) => c.compteId === compteId && c.date > date)
		.sort(
			(a, b) => a.date.localeCompare(b.date) || a.compteLe.localeCompare(b.compteLe) || a.id - b.id
		)[0];
}

/**
 * Un Côté daté avant un Comptage d'ouverture ne touche pas la Recette d'espèces, mais il change ce
 * qu'on aurait dû trouver ce jour-là. L'Écart de cette ouverture se recalcule donc, sans recomptage,
 * que la Session soit ouverte ou clôturée : les billets n'ont pas bougé, seul le solde attendu s'est
 * précisé. Sans cela, après clôture, `soldeCompte` garderait le ticket et s'écarterait de la caisse.
 * Les Comptages suivants repartent chacun du précédent : le premier suffit.
 */
export function reajusterEcartOuverture(
	o: Outils,
	cotes: readonly { compteId: number; date: DateCivile }[]
): Resultat<true> {
	const j = o.depots.operations.journal();
	const vus = new Set<number>();
	for (const { compteId } of cotes) {
		if (vus.has(compteId)) continue;
		vus.add(compteId);
		const dates = cotes.filter((c) => c.compteId === compteId).map((c) => c.date);
		const premiere = [...dates].sort()[0] as DateCivile;
		const ouverture = premierComptageApres(j, compteId, premiere);
		if (ouverture?.type !== 'ouverture') continue;
		const lie = j.operations.find((op) => op.id === ouverture.operationEcartId);
		const ecart = ecartAttendu(j, ouverture);
		if (ecart === centimes(lie?.cotes[0]?.montant ?? 0)) continue;
		const r = remplacerEcart(o, ouverture, ecart);
		if (!r.ok) return r;
	}
	return succes(true);
}
