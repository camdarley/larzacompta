/**
 * Ce que la page Pointage affiche, calculé d'un bloc à partir du journal (AD-4).
 * L'interface n'importe rien du serveur (AD-1) : ces formes vivent ici.
 */
import type { DateCivile } from '../dates.ts';
import { causesEcart, dernierConstat, ecart, type Causes } from '../etats/ecart.ts';
import { exerciceDeDate, soldeCompte, soldeDepart } from '../etats/soldes.ts';
import type { GrandJournal, LigneReleveJ } from '../journal.ts';
import { centimes, type Centimes } from '../montant.ts';
import type { Compte } from '../parametrage.ts';
import { numeroInscrit } from '../cheques/index.ts';
import { chequeAbsent, sumupPrecedent, type ModeleSumup } from './cheques.ts';
import { dateDepuisLigne } from './pointage.ts';
import { libelleDuCote, proposer, type Proposition } from './proposer.ts';
import { estVersementSumup, numeroChequeLu } from './references.ts';
import { trous, type Periode, type Trou } from './trous.ts';

export type EtatLigne = 'pointe' | 'a_pointer' | 'a_regarder';

export type ElementRelie = {
	operationId: number;
	libelle: string;
	date: DateCivile;
	montant: Centimes;
};

export type LigneFile = Pick<LigneReleveJ, 'id' | 'date' | 'montant' | 'libelle' | 'doublon'> & {
	etat: EtatLigne;
	manuelle: boolean;
	pointageId: number | null;
	relies: ElementRelie[];
	propositions: Proposition[];
	/** Une autre ligne du Compte a la même date, le même montant et le même libellé. */
	jumelle: boolean;
	/** Aucun Exercice n'accueille cette date : l'Opération attend qu'on ouvre le suivant. */
	horsExercice: boolean;
	/** N° d'un chèque payé, absent du registre (FR-23). */
	chequeAbsent: string | null;
	/** Ce n° figure bien au registre, mais comme annulé. */
	chequeAnnule: boolean;
	/** Versement SumUp : se répartit en brut et frais (FR-24). */
	sumup: boolean;
};

export type BarreEcartVue = {
	/** Solde du dernier relevé, et sa date. Null tant qu'aucun solde n'est connu. */
	releve: Centimes | null;
	dateReleve: DateCivile | null;
	calcule: Centimes;
	ecart: Centimes | null;
	pointees: number;
	total: number;
	depart: Centimes;
	mouvements: Centimes;
};

export type CausesVue = {
	ecart: Centimes;
	explique: Centimes;
	nonExplique: Centimes;
	lignes: Pick<LigneFile, 'id' | 'date' | 'montant' | 'libelle'>[];
	cotes: ElementRelie[];
	anciennes: ElementRelie[];
};

export type VuePointage = {
	lignes: LigneFile[];
	barre: BarreEcartVue;
	causes: CausesVue | null;
	trou: Trou | null;
	dernierPointageId: number | null;
};

/** Résultat d'un import, sans changer d'écran. */
export type Recapitulatif = {
	type: 'recapitulatif';
	lues: number;
	nouvelles: number;
	connues: number;
	ecartees: number;
	aConfirmer: number;
	/** Identifiant déjà porté par une autre ligne : gardées sans lui, à confirmer (FR-12). */
	identifiantsRepetes: number;
	/** Solde daté dans un Exercice clôturé ou avant l'ancre : les lignes passent, pas le solde. */
	soldeIgnore: boolean;
	/** Le fichier n'a pas de solde : il se demande à l'écran. */
	soldeDemande: { date: DateCivile } | null;
	trou: Trou | null;
};

const accord = (n: number, singulier: string, pluriel: string) => (n > 1 ? pluriel : singulier);

/** « 23 lignes lues, 18 nouvelles, 5 déjà connues. » */
export function phraseRecapitulatif(r: Recapitulatif): string {
	const lues = `${r.lues} ${accord(r.lues, 'ligne lue', 'lignes lues')}`;
	const nouvelles = `${r.nouvelles} ${accord(r.nouvelles, 'nouvelle', 'nouvelles')}`;
	const connues = `${r.connues} déjà ${accord(r.connues, 'connue', 'connues')}`;
	return `${lues}, ${nouvelles}, ${connues}.`;
}

export function phraseEcartees(n: number): string {
	return n > 1
		? `${n} lignes antérieures au solde de départ sont écartées.`
		: '1 ligne antérieure au solde de départ est écartée.';
}

export type LigneASaisir = Pick<LigneReleveJ, 'id' | 'compteId' | 'libelle' | 'montant'> & {
	date: DateCivile;
	rattachementId: number | null;
	/** N° lu dans le libellé d'un chèque payé : il reste à l'inscrire au registre. */
	chequeLu: string | null;
	/** Dernière répartition d'un versement SumUp, reprise pour ne rien ressaisir. */
	sumup: ModeleSumup | null;
};

/** Ce que le panneau reprend d'une Ligne de relevé (FR-14, FR-23, FR-24). */
export function ligneASaisir(
	j: GrandJournal,
	l: LigneReleveJ,
	date: {
		date: DateCivile;
		rattachementId: number | null;
	}
): LigneASaisir {
	return {
		id: l.id,
		compteId: l.compteId,
		libelle: l.libelle,
		montant: l.montant,
		...date,
		chequeLu: l.montant < 0 ? numeroChequeLu(l.libelle) : null,
		sumup: estVersementSumup(l) ? sumupPrecedent(j) : null
	};
}

export type ComptePointable = Pick<Compte, 'id' | 'libelle' | 'type'>;

export function comptesPointables(j: Pick<GrandJournal, 'comptes'>): ComptePointable[] {
	return j.comptes
		.filter((c) => c.actif && (c.type === 'banque' || c.type === 'epargne'))
		.map(({ id, libelle, type }) => ({ id, libelle, type }));
}

/** Compteur de `barre-laterale` : ce qu'il reste à pointer, tous Comptes confondus. */
export function lignesAPointer(j: Pick<GrandJournal, 'lignesReleve' | 'pointages'>): number {
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	return j.lignesReleve.filter((l) => !pointees.has(l.id)).length;
}

function elementsRelies(j: GrandJournal, coteIds: readonly number[]): ElementRelie[] {
	return j.operations.flatMap((op) =>
		op.cotes
			.filter((c) => coteIds.includes(c.id))
			.map((c) => ({
				operationId: op.id,
				libelle: libelleDuCote(j, op, c),
				date: c.date,
				montant: c.montant
			}))
	);
}

function causesVue(j: GrandJournal, c: Causes): CausesVue {
	const vue = (liste: Causes['cotes']) =>
		liste.map(({ cote, operation }) => ({
			operationId: operation.id,
			libelle: libelleDuCote(j, operation, cote),
			date: cote.date,
			montant: cote.montant
		}));
	return {
		ecart: c.ecart,
		explique: c.explique,
		nonExplique: c.nonExplique,
		lignes: c.lignes.map(({ id, date, montant, libelle }) => ({ id, date, montant, libelle })),
		cotes: vue(c.cotes),
		anciennes: vue(c.anciennes)
	};
}

/** Non pointées d'abord, chaque groupe par date. Pointées : seulement depuis `depuis`. */
function fileDe(j: GrandJournal, compteId: number, depuis: DateCivile | null): LigneFile[] {
	const duCompte = j.lignesReleve.filter((l) => l.compteId === compteId);
	const lignes = duCompte
		.map((l): LigneFile => {
			const pointage = j.pointages.find((p) => p.ligneReleveIds.includes(l.id));
			const etat = pointage ? 'pointe' : l.doublon === 'a_confirmer' ? 'a_regarder' : 'a_pointer';
			const absent = pointage ? null : chequeAbsent(j, l);
			return {
				id: l.id,
				date: l.date,
				montant: l.montant,
				libelle: l.libelle,
				doublon: l.doublon,
				etat,
				manuelle: l.importId === null,
				pointageId: pointage?.id ?? null,
				relies: pointage ? elementsRelies(j, pointage.coteIds) : [],
				propositions: etat === 'a_pointer' ? proposer(j, l) : [],
				jumelle: duCompte.some((x) => x.id !== l.id && x.empreinte === l.empreinte),
				horsExercice: !dateDepuisLigne(j.exercices, l.date).ok,
				chequeAbsent: absent,
				chequeAnnule: absent !== null && numeroInscrit(j, absent),
				sumup: !pointage && estVersementSumup(l)
			};
		})
		.filter((l) => l.etat !== 'pointe' || depuis === null || l.date >= depuis);
	const parDate = (a: LigneFile, b: LigneFile) => a.date.localeCompare(b.date) || a.id - b.id;
	return [
		...lignes.filter((l) => l.etat !== 'pointe').sort(parDate),
		...lignes.filter((l) => l.etat === 'pointe').sort(parDate)
	];
}

export function vuePointage(
	j: GrandJournal,
	compteId: number,
	o: {
		aujourdhui: DateCivile;
		depuis: DateCivile | null;
		periodes: readonly (Periode & { id: number })[];
	}
): VuePointage {
	const lignes = fileDe(j, compteId, o.depuis);
	const constat = dernierConstat(j, compteId, '9999-12-31');
	const d = constat?.date ?? o.aujourdhui;
	const calcule = soldeCompte(j, compteId, d);
	const exercice = exerciceDeDate(j.exercices, d);
	const depart = exercice
		? soldeDepart(j, compteId, exercice)
		: (j.ancres.find((a) => a.compteId === compteId)?.solde ?? centimes(0));
	const dernierePeriode = [...o.periodes].sort((a, b) => a.id - b.id).at(-1);
	const causes = causesEcart(j, compteId, d, dernierePeriode?.dateMin ?? d);

	return {
		lignes,
		barre: {
			releve: constat?.solde ?? null,
			dateReleve: constat?.date ?? null,
			calcule,
			ecart: ecart(j, compteId, d),
			pointees: lignes.filter((l) => l.etat === 'pointe').length,
			total: lignes.length,
			depart,
			mouvements: centimes(calcule - depart)
		},
		causes: causes && causesVue(j, causes),
		trou: trous(o.periodes).at(-1) ?? null,
		dernierPointageId: j.pointages.filter((p) => p.compteId === compteId).at(-1)?.id ?? null
	};
}
