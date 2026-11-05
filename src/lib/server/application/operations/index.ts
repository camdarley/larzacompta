/** Seul module qui écrit dans `operation`, `cote`, `ligne` et `liaison` (AD-7). */
import { formaterMontant, formaterCsv, centimes, type Centimes } from '#lib/domaine/montant.ts';
import {
	dateProposee,
	estPointee,
	cotesPointes,
	intentionDe,
	montantOperation
} from '#lib/domaine/operations/lecture.ts';
import {
	deciderAnnulation,
	deciderModification,
	estSpecialisee,
	exerciceFigeant
} from '#lib/domaine/operations/corrections.ts';
import {
	formeCompensee,
	formeInterne,
	formeStandard,
	type Intention,
	type SaisieCompensee,
	type SaisieInterne,
	type SaisieStandard
} from '#lib/domaine/operations/formes.ts';
import {
	deciderLiaison,
	estSommeARendre,
	phraseLiaison,
	resteARendre,
	resumeLiaison
} from '#lib/domaine/operations/liaisons.ts';
import { recents } from '#lib/domaine/operations/recents.ts';
import { noteSuggestion, suggerer, type Suggestion } from '#lib/domaine/operations/suggestions.ts';
import {
	validerOperation,
	type Brouillon,
	type BrouillonValide,
	type ExistantLignes,
	type ReferencesSaisie
} from '#lib/domaine/operations/validation.ts';
import type { DateCivile } from '#lib/domaine/dates.ts';
import { exerciceDeDate, soldeCompte, soldeDepart } from '#lib/domaine/etats/soldes.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import {
	LIBELLES_MODE_PAIEMENT,
	type GrandJournal,
	type ModePaiement,
	type OperationJ
} from '#lib/domaine/journal.ts';
import type { Action, Compte, Nature } from '#lib/domaine/parametrage.ts';
import {
	chercherPalette,
	phraseLigneTrouvee,
	rechercher,
	resumeAnalytique,
	resumeCompte,
	type FiltresRecherche,
	type Trouvee
} from '#lib/domaine/recherche/index.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import type {
	ContexteSaisie,
	DetailOperation,
	PageOperations,
	RangeeOperation
} from '#lib/domaine/operations/vues.ts';

export const TAILLE_PAGE_OPERATIONS = 50;

export type EntreeOperation =
	| ({ forme: 'standard' } & SaisieStandard)
	| ({ forme: 'interne' } & SaisieInterne)
	| ({ forme: 'compensee' } & SaisieCompensee);

export type OptionsEcriture = {
	/** Clé de saisie : renvoyer la même saisie après une coupure n'écrit rien de plus. */
	cle?: string;
};

export type EntreeCreation = EntreeOperation &
	OptionsEcriture & {
		/** Rendre une somme reçue : relie les deux Opérations (FR-8). */
		rendDe?: number;
	};

export type EntreeModification = {
	id: number;
	version: number;
	saisie: EntreeOperation;
} & OptionsEcriture;

function versBrouillon(e: EntreeOperation): Brouillon {
	if (e.forme === 'interne') return formeInterne(e);
	if (e.forme === 'compensee') return formeCompensee(e);
	return formeStandard(e);
}

function referencesSaisie(o: Pick<Outils, 'depots'>): ReferencesSaisie {
	const p = o.depots.parametrage;
	return {
		exercices: o.depots.exercices.lister(),
		ancres: p.ancres(),
		comptes: p.comptes(),
		natures: p.natures(),
		actions: p.actions()
	};
}

const coteIdsPointes = (o: Pick<Outils, 'depots'>, op: OperationJ) =>
	cotesPointes({ pointages: o.depots.operations.journal().pointages }, op);

function nomDeForme(b: Brouillon) {
	if (b.genre === 'interne') return 'le Mouvement interne';
	if (b.genre === 'compensee') return 'l’Opération compensée';
	return (b.cotes[0]?.montant ?? 0) < 0 ? 'la Dépense' : 'la Recette';
}

function montantDeForme(b: Brouillon): Centimes {
	const premier = b.cotes[0]?.montant ?? 0;
	return centimes(Math.abs(premier));
}

/**
 * Écrit une Opération validée, avec son entrée de Journal.
 * Un module qui a besoin d'une Opération passe par ici, avec son `origine` (AD-7).
 */
export function ecrireOperation(
	o: Outils,
	brouillon: Brouillon,
	options: OptionsEcriture = {}
): Resultat<{ id: number }> {
	const decision = validerOperation(brouillon, referencesSaisie(o));
	if (!decision.ok) return decision;
	const acces = o.ctx.acces as NonNullable<Ctx['acces']>;
	const id = o.depots.operations.creer({
		...decision.valeur,
		creeLe: o.ctx.maintenant,
		creePar: acces.id
	});
	o.noter({
		evenement: 'operation.creee',
		entiteType: 'operation',
		entiteId: id,
		resume: `a enregistré ${nomDeForme(brouillon)} « ${brouillon.libelle} » de ${formaterMontant(montantDeForme(brouillon))}.`,
		apres: { ...decision.valeur, cle: options.cle }
	});
	return succes({ id });
}

function existantDe(op: OperationJ): ExistantLignes {
	return {
		natureIds: op.lignes.map((l) => l.natureId),
		actionIds: op.lignes.flatMap((l) => (l.actionId === null ? [] : [l.actionId]))
	};
}

function brouillonDe(op: OperationJ): BrouillonValide {
	return {
		genre: op.genre,
		origine: op.origine,
		date: op.date,
		libelle: op.libelle,
		reference: op.reference,
		modePaiement: op.modePaiement,
		note: op.note,
		tiers: op.tiers,
		sansPiece: op.sansPiece,
		cotes: op.cotes.map((c) => ({ compteId: c.compteId, date: c.date, montant: c.montant })),
		lignes: op.lignes.map((l) => ({
			montant: l.montant,
			estReduction: l.estReduction,
			natureId: l.natureId,
			actionId: l.actionId,
			exerciceRattachementId: l.exerciceRattachementId,
			note: l.note
		}))
	};
}

function modifierOperation(o: Outils, e: EntreeModification): Resultat<{ id: number }> {
	const depot = o.depots.operations;
	const avant = depot.parId(e.id);
	if (avant === null) return echec('element_introuvable');

	const references = referencesSaisie(o);
	const decision = deciderModification(avant, versBrouillon(e.saisie), {
		versionLue: e.version,
		coteIdsPointes: coteIdsPointes(o, avant),
		exercices: references.exercices
	});
	if (!decision.ok) return decision;

	const validation = validerOperation(decision.valeur, references, existantDe(avant));
	if (!validation.ok) return validation;

	if (!depot.modifier(e.id, e.version, validation.valeur)) {
		return echec('modification_concurrente');
	}
	o.noter({
		evenement: 'operation.modifiee',
		entiteType: 'operation',
		entiteId: e.id,
		resume: `a modifié ${nomDeForme(validation.valeur)} « ${validation.valeur.libelle} ».`,
		avant: brouillonDe(avant),
		apres: { ...validation.valeur, cle: e.cle }
	});
	return succes({ id: e.id });
}

type Noms = { comptes: Compte[]; natures: Nature[]; actions: Action[] };

function rangee(j: GrandJournal, noms: Noms, t: Trouvee): RangeeOperation {
	const op = t.operation;
	const courant = exerciceDeDate(j.exercices, op.date);
	const pointable = op.cotes.some((c) => {
		const type = j.comptes.find((x) => x.id === c.compteId)?.type;
		return type === 'banque' || type === 'epargne';
	});
	const rattaches = new Set(
		op.lignes.map((l) => l.exerciceRattachementId).filter((id) => id !== courant?.id)
	);
	return {
		id: op.id,
		date: op.date,
		libelle: op.libelle,
		reference: op.reference,
		genre: op.genre,
		compte: resumeCompte(op, noms),
		...resumeAnalytique(op, noms),
		montant: montantOperation(op),
		annulee: t.annulee,
		cloture: exerciceFigeant(op, j.exercices) !== undefined,
		pieces: op.pieces.length,
		etat: estPointee(j, op) ? 'pointe' : pointable ? 'a_pointer' : null,
		rattachements: [...rattaches].flatMap((id) => {
			const e = j.exercices.find((x) => x.id === id);
			return e ? [e.libelle] : [];
		}),
		ligneTrouvee: phraseLigneTrouvee(t)
	};
}

export type SoldeVue = {
	compte: Compte;
	depart: Centimes;
	mouvements: Centimes;
	solde: Centimes;
};

const nomMode = (m: ModePaiement | null) => (m ? LIBELLES_MODE_PAIEMENT[m] : '');

export function creerOperations(socle: Socle, executer: Executer, lire: Lire) {
	const depots = socle.depots;

	const noms = (): Noms => ({
		comptes: depots.parametrage.comptes(),
		natures: depots.parametrage.natures(),
		actions: depots.parametrage.actions()
	});

	const casCreation: CasUsage<EntreeCreation, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const brouillon = versBrouillon(e);
			const cree = ecrireOperation(o, brouillon, { cle: e.cle });
			if (!cree.ok || e.rendDe === undefined) return cree;

			// Rendre une somme : les deux Opérations se relient par une liaison neutre.
			const depot = o.depots.operations;
			const recue = depot.parId(e.rendDe);
			if (recue === null) return echec('element_introuvable');
			const liaisonId =
				recue.liaisonId ?? depot.creerLiaison({ type: 'somme_a_rendre', libelle: recue.libelle });
			depot.definirLiaison(recue.id, liaisonId);
			depot.definirLiaison(cree.valeur.id, liaisonId);
			return cree;
		}
	};

	const casModification: CasUsage<EntreeModification, { id: number }> = {
		droit: 'saisir',
		faire: modifierOperation
	};

	const casAnnulation: CasUsage<number, { id: number }> = {
		droit: 'saisir',
		faire(o, id) {
			const depot = o.depots.operations;
			const op = depot.parId(id);
			if (op === null) return echec('element_introuvable');
			const decision = deciderAnnulation(op, {
				coteIdsPointes: coteIdsPointes(o, op),
				exercices: o.depots.exercices.lister()
			});
			if (!decision.ok) return decision;
			depot.annuler(id, o.ctx.maintenant, (o.ctx.acces as NonNullable<Ctx['acces']>).id);
			o.noter({
				evenement: 'operation.annulee',
				entiteType: 'operation',
				entiteId: id,
				resume: `a annulé l’Opération « ${op.libelle} » de ${formaterMontant(centimes(Math.abs(montantOperation(op))))}.`,
				avant: brouillonDe(op)
			});
			return succes({ id });
		}
	};

	/** `liaison_id` reste modifiable après clôture : il ne change aucun état (AD-5). */
	const casRelier: CasUsage<
		{ id: number; autreId: number; libelle: string },
		{ liaisonId: number }
	> = {
		droit: 'saisir',
		faire(o, e) {
			const depot = o.depots.operations;
			const [a, b] = [depot.parId(e.id), depot.parId(e.autreId)];
			if (a === null || b === null) return echec('element_introuvable');
			const decision = deciderLiaison(a, b, depot.liaisons());
			if (!decision.ok) return decision;

			const d = decision.valeur;
			let liaisonId: number;
			if (d.type === 'nouvelle') {
				liaisonId = depot.creerLiaison({ type: 'paiement_multiple', libelle: e.libelle });
			} else if (d.type === 'rejoindre') {
				liaisonId = d.liaisonId;
			} else {
				liaisonId = d.garderId;
				depot.deplacerLiaison(d.retirerId, d.garderId);
				depot.retirerLiaison(d.retirerId);
			}
			depot.definirLiaison(a.id, liaisonId);
			depot.definirLiaison(b.id, liaisonId);
			o.noter({
				evenement: 'operation.reliee',
				entiteType: 'operation',
				entiteId: a.id,
				resume: `a relié « ${a.libelle} » et « ${b.libelle} ».`
			});
			return succes({ liaisonId });
		}
	};

	const casDelier: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const depot = o.depots.operations;
			const op = depot.parId(id);
			if (op === null) return echec('element_introuvable');
			const liaisonId = op.liaisonId;
			if (liaisonId === null) return echec('liaison_invalide');
			depot.definirLiaison(id, null);
			// Une liaison d'une seule Opération ne relie plus rien.
			if (depot.operationsDeLiaison(liaisonId).length < 2) depot.retirerLiaison(liaisonId);
			o.noter({
				evenement: 'operation.deliee',
				entiteType: 'operation',
				entiteId: id,
				resume: `a délié « ${op.libelle} ».`
			});
			return succes(true);
		}
	};

	/** La première écriture a pu aboutir sans que la réponse revienne : on ne la rejoue pas. */
	function dejaTraite(cle: string | undefined): number | null {
		return cle === undefined ? null : depots.journal.entiteDeCle(cle);
	}

	return {
		creer(ctx: Ctx, e: EntreeCreation): Resultat<{ id: number }> {
			const lu = lire(ctx, 'saisir', () => dejaTraite(e.cle));
			if (!lu.ok) return lu;
			return lu.valeur === null ? executer(casCreation, ctx, e) : succes({ id: lu.valeur });
		},

		modifier(ctx: Ctx, e: EntreeModification): Resultat<{ id: number }> {
			const lu = lire(ctx, 'saisir', () => dejaTraite(e.cle));
			if (!lu.ok) return lu;
			return lu.valeur === null ? executer(casModification, ctx, e) : succes({ id: lu.valeur });
		},

		annuler: (ctx: Ctx, id: number) => executer(casAnnulation, ctx, id),
		relier: (ctx: Ctx, e: { id: number; autreId: number; libelle: string }) =>
			executer(casRelier, ctx, e),
		delier: (ctx: Ctx, id: number) => executer(casDelier, ctx, id),

		journal(ctx: Ctx): Resultat<GrandJournal> {
			return lire(ctx, 'consulter', () => depots.operations.journal());
		},

		rechercher(ctx: Ctx, filtres: FiltresRecherche, page: number): Resultat<PageOperations> {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const trouvees = rechercher(j, filtres);
				const n = noms();
				const pages = Math.max(1, Math.ceil(trouvees.length / TAILLE_PAGE_OPERATIONS));
				const courante = Math.min(page, pages);
				const debut = (courante - 1) * TAILLE_PAGE_OPERATIONS;
				return {
					rangees: trouvees
						.slice(debut, debut + TAILLE_PAGE_OPERATIONS)
						.map((t) => rangee(j, n, t)),
					total: trouvees.length,
					page: courante,
					pages
				};
			});
		},

		/** Une rangée par Ligne : l'export se retravaille dans un tableur. */
		exporter(ctx: Ctx, filtres: FiltresRecherche): Resultat<string> {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const n = noms();
				const nom = (liste: readonly { id: number; libelle: string }[], id: number | null) =>
					liste.find((x) => x.id === id)?.libelle ?? '';
				const entetes = [
					'Date',
					'Libellé',
					'Compte',
					'Nature',
					'Action',
					'Exercice de rattachement',
					'Montant de la Ligne',
					'Montant de l’Opération',
					'Mode de paiement',
					'Référence',
					'Tiers',
					'Note',
					'Pièces',
					'État'
				];
				const lignes = rechercher(j, filtres).flatMap(({ operation: op, annulee }) => {
					const commun = {
						total: formaterCsv(montantOperation(op)),
						fin: [
							nomMode(op.modePaiement),
							op.reference ?? '',
							op.tiers ?? '',
							op.note ?? '',
							String(op.pieces.length),
							annulee ? 'Annulée' : estPointee(j, op) ? 'Pointée' : ''
						]
					};
					const compte = resumeCompte(op, n);
					if (op.lignes.length === 0) {
						return [
							[
								op.date,
								op.libelle,
								compte,
								'Mouvement interne',
								'',
								'',
								'',
								commun.total,
								...commun.fin
							]
						];
					}
					return op.lignes.map((l) => [
						op.date,
						op.libelle,
						compte,
						nom(n.natures, l.natureId),
						nom(n.actions, l.actionId),
						nom(j.exercices, l.exerciceRattachementId),
						formaterCsv(l.montant),
						commun.total,
						...commun.fin
					]);
				});
				return socle.exporteurs.csv(entetes, lignes);
			});
		},

		/** `calcul-pose` de chaque Compte : départ, mouvements, solde calculé (AD-4). */
		soldes(ctx: Ctx, exercice: Exercice): Resultat<SoldeVue[]> {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const debut = (id: number | undefined) =>
					j.exercices.find((e) => e.id === id)?.anneeDebut ?? exercice.anneeDebut;
				return j.comptes.flatMap((compte) => {
					const ancre = j.ancres.find((a) => a.compteId === compte.id);
					if (!compte.actif || debut(ancre?.exerciceId) > exercice.anneeDebut) return [];
					const depart = soldeDepart(j, compte.id, exercice);
					const solde = exercice.fin === null ? depart : soldeCompte(j, compte.id, exercice.fin);
					return [{ compte, depart, mouvements: centimes(solde - depart), solde }];
				});
			});
		},

		contexteSaisie(ctx: Ctx): Resultat<ContexteSaisie> {
			return lire(ctx, 'consulter', () => {
				const n = noms();
				return {
					...n,
					groupes: depots.parametrage.groupes(),
					exercices: depots.exercices.lister(),
					recents: recents(depots.operations.journal()),
					natureSommeARendre: n.natures.find((x) => x.codeSysteme === 'somme_a_rendre')?.id ?? null,
					aujourdhui: ctx.aujourdhui
				};
			});
		},

		detail(ctx: Ctx, id: number): Resultat<DetailOperation> {
			const r = lire(ctx, 'consulter', () => {
				const operation = depots.operations.parId(id);
				if (operation === null) return null;
				const j = depots.operations.journal();
				const pointes = cotesPointes(j, operation);
				const pointages = j.pointages.filter((p) => p.coteIds.some((c) => pointes.includes(c)));
				const resume = operation.liaisonId === null ? null : resumeLiaison(j, operation.liaisonId);
				const sommeNature = depots.parametrage
					.natures()
					.find((n) => n.codeSysteme === 'somme_a_rendre')?.id;
				const detail: DetailOperation = {
					operation,
					intention: intentionDe(operation),
					annulee: operation.annuleeLe !== null,
					pointee: pointes.length > 0,
					rangsPointes: operation.cotes.flatMap((c, i) => (pointes.includes(c.id) ? [i] : [])),
					figeePar: exerciceFigeant(operation, j.exercices)?.libelle ?? null,
					specialisee: estSpecialisee(operation),
					liaison: resume && {
						id: resume.liaison.id,
						type: resume.liaison.type,
						phrase: phraseLiaison(resume),
						libelle: resume.liaison.libelle,
						total: resume.total,
						operations: resume.operations.map((o) => ({
							id: o.id,
							libelle: o.libelle,
							date: o.date,
							montant: montantOperation(o)
						}))
					},
					resteARendre:
						sommeNature !== undefined &&
						operation.annuleeLe === null &&
						estSommeARendre(operation, sommeNature)
							? resteARendre(j, operation)
							: null,
					mouvements: j.lignesReleve
						.filter((l) => pointages.some((p) => p.ligneReleveIds.includes(l.id)))
						.map(({ id: ligneId, date, montant, libelle }) => ({
							id: ligneId,
							date,
							montant,
							libelle
						})),
					historique: depots.journal.parEntite('operation', id)
				};
				return detail;
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		suggestion(
			ctx: Ctx,
			texte: string,
			intention: Intention
		): Resultat<(Suggestion & { note: string }) | null> {
			return lire(ctx, 'saisir', () => {
				const s = suggerer(depots.operations.journal(), noms(), texte, intention);
				return s && { ...s, note: noteSuggestion(s) };
			});
		},

		/** Candidats de `selecteur-recherche` : Opérations à relier, dépense à rembourser. */
		candidats(
			ctx: Ctx,
			texte: string,
			sens: Intention | null,
			sauf: number | null
		): Resultat<RangeeOperation[]> {
			return lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				const n = noms();
				return rechercher({ ...j, operationsAnnulees: [] }, { texte })
					.filter(
						(t) =>
							t.operation.id !== sauf &&
							t.operation.genre !== 'interne' &&
							(sens === null || intentionDe(t.operation) === sens)
					)
					.slice(0, 8)
					.map((t) => rangee(j, n, t));
			});
		},

		palette(ctx: Ctx, texte: string) {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const n = noms();
				const trouve = chercherPalette(j, n.actions, texte);
				return {
					operations: trouve.operations.map((t) => rangee(j, n, t)),
					actions: trouve.actions
				};
			});
		},

		dateParDefaut(ctx: Ctx, exercice: Exercice | null): DateCivile {
			return dateProposee(ctx.aujourdhui, exercice);
		}
	};
}

export type ModuleOperations = ReturnType<typeof creerOperations>;
