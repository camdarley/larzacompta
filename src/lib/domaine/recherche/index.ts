/** Recherche FR-11 et `palette` : des fonctions pures sur le grand journal (AD-4). */
import type { DateCivile } from '../dates.ts';
import type { GrandJournal, LigneJ, OperationJ } from '../journal.ts';
import { formaterMontant, lireMontant, type Centimes } from '../montant.ts';
import { montantOperation } from '../operations/lecture.ts';
import { normaliser } from '../operations/suggestions.ts';
import type { Action, Compte, Nature } from '../parametrage.ts';

export type FiltresRecherche = {
	du?: DateCivile;
	au?: DateCivile;
	texte?: string;
	montant?: Centimes;
	compteId?: number;
	natureId?: number;
	actionId?: number;
	piece?: 'avec' | 'sans';
};

export type Trouvee = {
	operation: OperationJ;
	annulee: boolean;
	/** Ligne dont le montant répond à la recherche, si ce n'est pas celui de l'Opération. */
	ligne: LigneJ | null;
};

/** Une recherche de `250` vise aussi un montant : `Résultat` absent si le texte n'en est pas un. */
export function montantDeTexte(texte: string): Centimes | null {
	const net = texte.trim();
	if (!/^[\d\s  .,]+$/.test(net)) return null;
	const r = lireMontant(net);
	return r.ok && r.valeur !== 0 ? r.valeur : null;
}

function correspondMontant(op: OperationJ, m: Centimes) {
	const total = Math.abs(montantOperation(op)) === m;
	const ligne = op.lignes.find((l) => Math.abs(l.montant) === m) ?? null;
	return { trouve: total || ligne !== null, ligne: total ? null : ligne };
}

function correspondTexte(op: OperationJ, texte: string) {
	return [op.libelle, op.reference, op.tiers, op.note, ...op.lignes.map((l) => l.note)].some(
		(v) => v !== null && normaliser(v).includes(texte)
	);
}

function retenir(op: OperationJ, f: FiltresRecherche, annulee: boolean): Trouvee | null {
	if (f.du && op.date < f.du) return null;
	if (f.au && op.date > f.au) return null;
	if (f.compteId !== undefined && !op.cotes.some((c) => c.compteId === f.compteId)) return null;
	if (f.natureId !== undefined && !op.lignes.some((l) => l.natureId === f.natureId)) return null;
	if (f.actionId !== undefined && !op.lignes.some((l) => l.actionId === f.actionId)) return null;
	if (f.piece === 'avec' && op.pieces.length === 0) return null;
	if (f.piece === 'sans' && op.pieces.length > 0) return null;

	let ligne: LigneJ | null = null;
	if (f.montant !== undefined) {
		const m = correspondMontant(op, f.montant);
		if (!m.trouve) return null;
		ligne = m.ligne;
	}
	const brut = f.texte?.trim();
	if (brut) {
		const texte = normaliser(brut);
		const montant = montantDeTexte(brut);
		const parMontant = montant === null ? null : correspondMontant(op, montant);
		if (!correspondTexte(op, texte) && !parMontant?.trouve) return null;
		ligne ??= parMontant?.ligne ?? null;
	}
	return { operation: op, annulee, ligne };
}

/** Les plus récentes d'abord. Une Opération annulée reste trouvable, avec son état (O8). */
export function rechercher(
	j: Pick<GrandJournal, 'operations' | 'operationsAnnulees'>,
	f: FiltresRecherche
): Trouvee[] {
	const trouvees: Trouvee[] = [];
	for (const op of j.operations) {
		const t = retenir(op, f, false);
		if (t) trouvees.push(t);
	}
	for (const op of j.operationsAnnulees) {
		const t = retenir(op, f, true);
		if (t) trouvees.push(t);
	}
	return trouvees.sort(
		(a, b) => b.operation.date.localeCompare(a.operation.date) || b.operation.id - a.operation.id
	);
}

/** « Ligne de 250,00 € dans Autocars, 1 000,00 € » */
export function phraseLigneTrouvee(t: Pick<Trouvee, 'operation' | 'ligne'>): string | null {
	if (t.ligne === null) return null;
	const ligne = formaterMontant(Math.abs(t.ligne.montant) as Centimes);
	const total = formaterMontant(Math.abs(montantOperation(t.operation)) as Centimes);
	return `Ligne de ${ligne} dans ${t.operation.libelle}, ${total}`;
}

type Noms = {
	comptes: readonly Pick<Compte, 'id' | 'libelle'>[];
	natures: readonly Pick<Nature, 'id' | 'libelle'>[];
	actions: readonly Pick<Action, 'id' | 'libelle'>[];
};

const distincts = <T>(valeurs: readonly T[]) => [...new Set(valeurs)];

function resumer(
	ids: readonly number[],
	noms: readonly { id: number; libelle: string }[],
	pluriel: string
) {
	const [seul] = ids;
	if (ids.length > 1) return `${ids.length} ${pluriel}`;
	return seul === undefined ? '' : (noms.find((n) => n.id === seul)?.libelle ?? '');
}

/** Résumé d'une rangée : « Transport », « 3 Actions », « Sans Action ». */
export function resumeAnalytique(op: Pick<OperationJ, 'genre' | 'lignes'>, n: Noms) {
	if (op.genre === 'interne') return { natures: 'Mouvement interne', actions: '' };
	const actions = distincts(op.lignes.map((l) => l.actionId));
	const avecAction = actions.filter((a): a is number => a !== null);
	return {
		natures: resumer(distincts(op.lignes.map((l) => l.natureId)), n.natures, 'Natures'),
		actions:
			actions.length > 1
				? `${actions.length} Actions`
				: avecAction.length === 0
					? 'Sans Action'
					: resumer(avecAction, n.actions, 'Actions')
	};
}

/** « CCP », « CCP vers Livret ». Une compensée sans différentiel ne touche aucun Compte. */
export function resumeCompte(op: Pick<OperationJ, 'genre' | 'cotes'>, n: Pick<Noms, 'comptes'>) {
	const nom = (id: number | undefined) => n.comptes.find((c) => c.id === id)?.libelle ?? '';
	if (op.genre === 'interne') {
		const sortant = op.cotes.find((c) => c.montant < 0);
		const entrant = op.cotes.find((c) => c.montant > 0);
		return `${nom(sortant?.compteId)} vers ${nom(entrant?.compteId)}`;
	}
	return op.cotes.length === 0 ? 'Aucun Compte' : nom(op.cotes[0]?.compteId);
}

export type ResultatsPalette = {
	operations: Trouvee[];
	actions: { id: number; libelle: string }[];
};

const LIMITE_PALETTE = 8;

/** Une frappe de montant comme `250` cherche aussi dans les Lignes. */
export function chercherPalette(
	j: Pick<GrandJournal, 'operations'>,
	actions: readonly Pick<Action, 'id' | 'libelle' | 'actif'>[],
	texte: string
): ResultatsPalette {
	const net = normaliser(texte);
	if (net === '') return { operations: [], actions: [] };
	return {
		operations: rechercher({ operations: j.operations, operationsAnnulees: [] }, { texte }).slice(
			0,
			LIMITE_PALETTE
		),
		actions: actions
			.filter((a) => a.actif && normaliser(a.libelle).includes(net))
			.slice(0, LIMITE_PALETTE)
			.map(({ id, libelle }) => ({ id, libelle }))
	};
}
