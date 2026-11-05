/**
 * Registre des Chèques émis (Q6) : il vit avec l'Opération, dans sa transaction.
 * Sans import d'`operations` : ce module-ci l'appelle, et `cheques/index.ts` l'appelle aussi.
 */
import {
	estPaiementCheque,
	memeNumero,
	numeroInscrit,
	numeroReutilisable
} from '#lib/domaine/cheques/index.ts';
import type { GrandJournal } from '#lib/domaine/journal.ts';
import type { BrouillonValide } from '#lib/domaine/operations/validation.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { Ctx, Outils } from '../executer.ts';

const dejaUtilise = () => echec<never>('numero_cheque_utilise', { champ: 'reference' });

/** Le journal sans l'Opération écrite : son propre n° ne la gêne pas. */
function sansOperation(j: GrandJournal, id: number): GrandJournal {
	return {
		...j,
		operations: j.operations.filter((o) => o.id !== id),
		chequesEmis: j.chequesEmis.filter((c) => c.operationId !== id)
	};
}

/** Créer, ou reprendre la formule d'un paiement annulé qu'on corrige. */
function ecrireChequeEmis(
	o: Outils,
	j: GrandJournal,
	operationId: number,
	numero: string,
	beneficiaire: string
): Resultat<true> {
	const reste = sansOperation(j, operationId);
	const connu = reste.chequesEmis.find((c) => memeNumero(c.numero, numero));
	if (connu && numeroReutilisable(j, connu)) {
		const fiche = { numero, beneficiaire, operationId };
		o.depots.cheques.reprendreEmis(connu.id, fiche);
		return succes(true);
	}
	if (numeroInscrit(reste, numero)) return dejaUtilise();
	o.depots.cheques.creerEmis({
		numero,
		beneficiaire,
		operationId,
		annuleLe: null,
		annulePar: null
	});
	return succes(true);
}

/** Mode Chèque d'une Dépense : le n° et le bénéficiaire sont demandés (FR-23). */
export function inscrireChequeEmis(
	o: Outils,
	operationId: number,
	b: BrouillonValide
): Resultat<true> {
	if (!estPaiementCheque(b)) return succes(true);
	if (b.reference === null) return echec('numero_cheque_requis', { champ: 'reference' });
	if (b.tiers === null) return echec('champ_requis', { champ: 'tiers' });
	return ecrireChequeEmis(o, o.depots.operations.journal(), operationId, b.reference, b.tiers);
}

/** Le registre suit une Opération corrigée : n°, bénéficiaire, ou retrait si ce n'est plus un chèque. */
export function suivreChequeEmis(
	o: Outils,
	operationId: number,
	b: BrouillonValide
): Resultat<true> {
	const j = o.depots.operations.journal();
	const ligne = j.chequesEmis.find((c) => c.operationId === operationId);
	if (!estPaiementCheque(b) || b.reference === null) {
		if (ligne) o.depots.cheques.supprimerEmis(ligne.id);
		return succes(true);
	}
	const beneficiaire = b.tiers ?? ligne?.beneficiaire ?? b.libelle;
	if (ligne === undefined) {
		return ecrireChequeEmis(o, j, operationId, b.reference, beneficiaire);
	}
	if (numeroInscrit(sansOperation(j, operationId), b.reference)) return dejaUtilise();
	o.depots.cheques.modifierEmis(ligne.id, { numero: b.reference, beneficiaire });
	return succes(true);
}

/** Annulée, l'Opération laisse sa ligne au registre, état Annulé. */
export function retirerChequeEmis(o: Outils, operationId: number) {
	const j = o.depots.operations.journal();
	const ligne = j.chequesEmis.find((c) => c.operationId === operationId && c.annuleLe === null);
	if (ligne === undefined) return;
	const par = (o.ctx.acces as NonNullable<Ctx['acces']>).id;
	o.depots.cheques.annulerEmis(ligne.id, o.ctx.maintenant, par);
}
