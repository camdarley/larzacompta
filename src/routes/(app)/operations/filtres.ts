import { dateValide } from '#lib/domaine/dates.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import { lireMontant, type Centimes } from '#lib/domaine/montant.ts';
import type { FiltresRecherche } from '#lib/domaine/recherche/index.ts';

/** Filtres tels qu'écrits dans l'URL : recharger ou partager rend le même résultat (AD-19). */
export function filtresDepuisUrl(url: URL, exercice: Exercice | null) {
	const q = url.searchParams;
	const date = (nom: string) => {
		const d = q.get(nom);
		return d && dateValide(d) ? d : undefined;
	};
	const id = (nom: string) => Number(q.get(nom)) || undefined;
	const texteMontant = q.get('montant') ?? '';
	const lu = texteMontant.trim() === '' ? null : lireMontant(texteMontant);
	const montant: Centimes | undefined = lu?.ok ? (Math.abs(lu.valeur) as Centimes) : undefined;
	const piece = q.get('piece');

	const lus = {
		texte: q.get('q') ?? '',
		du: date('du'),
		au: date('au'),
		montant: texteMontant,
		compte: id('compte'),
		nature: id('nature'),
		action: id('action'),
		piece: piece === 'avec' || piece === 'sans' ? (piece as 'avec' | 'sans') : undefined,
		anciennes: q.get('anciennes') === '1' ? ('1' as const) : undefined,
		internes: q.get('internes') === '1' ? ('1' as const) : undefined
	};
	const recherche: FiltresRecherche = {
		texte: lus.texte || undefined,
		// Sans période choisie, le `selecteur-exercice` pilote la liste.
		// Une Opération ancienne peut précéder l'Exercice regardé : c'est même ce qu'on cherche.
		du: lus.du ?? (lus.au || lus.anciennes ? undefined : (exercice?.debut ?? undefined)),
		au: lus.au ?? (lus.du ? undefined : (exercice?.fin ?? undefined)),
		montant,
		compteId: lus.compte,
		natureId: lus.nature,
		actionId: lus.action,
		piece: lus.piece,
		internes: lus.internes !== undefined
	};
	return { url: lus, recherche };
}
