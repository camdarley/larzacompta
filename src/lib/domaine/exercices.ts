/** Exercices : ouverture, suite, repères (E1, E2, E5 à E7, AD-5). */
import { ajouterJours, type DateCivile } from './dates.ts';
import { echec, succes, type Resultat } from './resultat.ts';

export type StatutExercice = 'repere' | 'ouvert' | 'cloture';

export type Exercice = {
	id: number;
	libelle: string;
	anneeDebut: number;
	debut: DateCivile | null;
	fin: DateCivile | null;
	statut: StatutExercice;
};

export type NouvelExercice = Omit<Exercice, 'id'>;

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/** `2026-2027`, ou `2026` pour un Exercice sur l'année civile. */
export function libelleExercice(anneeDebut: number, moisDebut: number): string {
	return moisDebut === 1 ? String(anneeDebut) : `${anneeDebut}-${anneeDebut + 1}`;
}

export function bornesExercice(
	anneeDebut: number,
	moisDebut: number
): { debut: DateCivile; fin: DateCivile } {
	const debut = `${anneeDebut}-${deuxChiffres(moisDebut)}-01`;
	const lendemain = `${anneeDebut + 1}-${deuxChiffres(moisDebut)}-01`;
	return { debut, fin: ajouterJours(lendemain, -1) };
}

/** Année de début de l'Exercice qui contient `date`. */
export function anneeExerciceDe(date: DateCivile, moisDebut: number): number {
	const [annee = 0, mois = 0] = date.split('-').map(Number);
	return mois >= moisDebut ? annee : annee - 1;
}

const tenus = (exercices: readonly Exercice[]) =>
	exercices.filter((e) => e.statut !== 'repere').sort((a, b) => a.anneeDebut - b.anneeDebut);

const ouverts = (exercices: readonly Exercice[]) => exercices.filter((e) => e.statut === 'ouvert');

function exerciceOuvert(anneeDebut: number, moisDebut: number): NouvelExercice {
	return {
		libelle: libelleExercice(anneeDebut, moisDebut),
		anneeDebut,
		...bornesExercice(anneeDebut, moisDebut),
		statut: 'ouvert'
	};
}

export function deciderPremierExercice(
	exercices: readonly Exercice[],
	anneeDebut: number,
	moisDebut: number
): Resultat<NouvelExercice> {
	if (tenus(exercices).length > 0) return echec('exercice_invalide');
	if (exercices.some((e) => e.anneeDebut >= anneeDebut)) return echec('exercice_invalide');
	return succes(exerciceOuvert(anneeDebut, moisDebut));
}

/** E1 : deux Exercices ouverts au plus, qui se suivent sans trou ni chevauchement. */
export function deciderExerciceSuivant(
	exercices: readonly Exercice[],
	moisDebut: number
): Resultat<NouvelExercice> {
	const dernier = tenus(exercices).at(-1);
	if (dernier === undefined || ouverts(exercices).length >= 2) return echec('exercice_invalide');
	const suivant = exerciceOuvert(dernier.anneeDebut + 1, moisDebut);
	// Un changement de mois de début créerait un trou : la suite garde le calendrier du précédent.
	const debut = ajouterJours(dernier.fin as DateCivile, 1);
	if (debut !== suivant.debut) {
		const moisReel = Number(debut.split('-')[1]);
		return succes(exerciceOuvert(dernier.anneeDebut + 1, moisReel));
	}
	return succes(suivant);
}

/**
 * E2 : un repère précède le premier Exercice tenu et n'a ni dates ni ancre.
 * L'année se lit dans le nom (`2024-2025`), sinon il se place avant les repères existants.
 */
export function deciderRepere(
	exercices: readonly Exercice[],
	libelle: string
): Resultat<NouvelExercice> {
	if (exercices.some((e) => e.libelle === libelle)) return echec('exercice_invalide');
	const premierTenu = tenus(exercices)[0];
	const plafond = premierTenu?.anneeDebut ?? Number.MAX_SAFE_INTEGER;
	const lu = /^(\d{4})/.exec(libelle);
	const annee = lu ? Number(lu[1]) : null;
	const prises = exercices.map((e) => e.anneeDebut);
	const anneeDebut =
		annee !== null && annee < plafond && !prises.includes(annee)
			? annee
			: Math.min(plafond === Number.MAX_SAFE_INTEGER ? 9999 : plafond, ...prises) - 1;
	return succes({ libelle, anneeDebut, debut: null, fin: null, statut: 'repere' });
}

/** E6 : l'ancre se pose au début d'un Exercice ouvert. E7 : plus rien si un Exercice dépendant est clôturé. */
export function deciderAncre(
	exercices: readonly Exercice[],
	exerciceId: number,
	exerciceAncreActuelle: number | null
): Resultat<Exercice> {
	const cible = exercices.find((e) => e.id === exerciceId);
	if (cible === undefined || cible.statut !== 'ouvert') return echec('ancre_invalide');
	if (exerciceAncreActuelle !== null) {
		const actuel = exercices.find((e) => e.id === exerciceAncreActuelle);
		const fige = exercices.some(
			(e) => e.statut === 'cloture' && actuel !== undefined && e.anneeDebut >= actuel.anneeDebut
		);
		if (fige) return echec('exercice_cloture', actuel ? { exercice: actuel.libelle } : undefined);
	}
	return succes(cible);
}

/** Par défaut, l'Exercice ouvert le plus récent. */
export function exerciceParDefaut(exercices: readonly Exercice[]): Exercice | null {
	const parRecence = [...exercices].sort((a, b) => b.anneeDebut - a.anneeDebut);
	return (
		parRecence.find((e) => e.statut === 'ouvert') ??
		parRecence.find((e) => e.statut === 'cloture') ??
		null
	);
}

/** Exercice affiché : celui de l'URL s'il existe et se consulte, sinon le défaut. */
export function exerciceSelectionne(
	exercices: readonly Exercice[],
	libelle: string | null
): Exercice | null {
	const demande = exercices.find((e) => e.libelle === libelle && e.statut !== 'repere');
	return demande ?? exerciceParDefaut(exercices);
}
