import {
	anneeExerciceDe,
	deciderExerciceSuivant,
	deciderPremierExercice,
	deciderRepere,
	exerciceSelectionne,
	libelleExercice,
	type Exercice,
	type NouvelExercice
} from '#lib/domaine/exercices.ts';
import { centimes, type Centimes } from '#lib/domaine/montant.ts';
import { libelleDisponible, prochainOrdre, type TypeCompte } from '#lib/domaine/parametrage.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import { poserAncre } from '../parametrage/index.ts';

export type SoldeCompte = { compteId: number; solde: Centimes };

export type CompteDeDepart = {
	id?: number;
	libelle: string;
	type: TypeCompte;
	solde: Centimes;
};

export type EntreeDemarrage = {
	anneeDebut: number;
	comptes: CompteDeDepart[];
};

function creerExercice(o: Outils, e: NouvelExercice): Resultat<Exercice> {
	const id = o.depots.exercices.creer(e);
	o.noter({
		evenement: e.statut === 'repere' ? 'exercice.repere_ajoute' : 'exercice.ouvert',
		entiteType: 'exercice',
		entiteId: id,
		resume:
			e.statut === 'repere'
				? `a ajouté l’Exercice repère ${e.libelle}.`
				: `a ouvert l’Exercice ${e.libelle}.`
	});
	return succes({ ...e, id });
}

function moisDebut(o: Outils): Resultat<number> {
	const a = o.depots.parametrage.association();
	return a ? succes(a.moisDebutExercice) : echec('association_absente');
}

export function creerExercices(socle: Socle, executer: Executer, lire: Lire) {
	const depot = socle.depots.exercices;

	const casPremier: CasUsage<{ anneeDebut: number; soldes: SoldeCompte[] }, Exercice> = {
		droit: 'parametrer',
		faire(o, e) {
			const mois = moisDebut(o);
			if (!mois.ok) return mois;
			const decision = deciderPremierExercice(
				o.depots.exercices.lister(),
				e.anneeDebut,
				mois.valeur
			);
			if (!decision.ok) return decision;
			const exercice = creerExercice(o, decision.valeur);
			if (!exercice.ok) return exercice;
			const exercices = o.depots.exercices.lister();
			const comptes = o.depots.parametrage.comptes();
			// Chaque Compte reçoit une seule ancre : ce qui n'est pas saisi part de 0.
			for (const compte of comptes) {
				const solde = e.soldes.find((s) => s.compteId === compte.id)?.solde ?? centimes(0);
				const ancre = poserAncre(o, compte, exercices, exercice.valeur.id, solde);
				if (!ancre.ok) return ancre;
			}
			return exercice;
		}
	};

	const casSuivant: CasUsage<void, Exercice> = {
		droit: 'parametrer',
		faire(o) {
			const mois = moisDebut(o);
			if (!mois.ok) return mois;
			const decision = deciderExerciceSuivant(o.depots.exercices.lister(), mois.valeur);
			return decision.ok ? creerExercice(o, decision.valeur) : decision;
		}
	};

	const casRepere: CasUsage<string, Exercice> = {
		droit: 'parametrer',
		faire(o, libelle) {
			const decision = deciderRepere(o.depots.exercices.lister(), libelle);
			return decision.ok ? creerExercice(o, decision.valeur) : decision;
		}
	};

	const casBalance: CasUsage<{ exerciceId: number; soldes: SoldeCompte[] }, true> = {
		droit: 'parametrer',
		faire(o, e) {
			const exercices = o.depots.exercices.lister();
			const comptes = o.depots.parametrage.comptes();
			for (const s of e.soldes) {
				const compte = comptes.find((c) => c.id === s.compteId);
				if (compte === undefined) return echec('element_introuvable');
				const ancre = poserAncre(o, compte, exercices, e.exerciceId, s.solde);
				if (!ancre.ok) return ancre;
			}
			o.noter({
				evenement: 'balance.enregistree',
				entiteType: 'exercice',
				entiteId: e.exerciceId,
				resume: 'a enregistré une Balance d’ouverture.'
			});
			return succes(true);
		}
	};

	/**
	 * Étape « Vos Comptes » de l'assistant. Rejouable : un retour en arrière corrige sans dupliquer.
	 * Ouvre l'Exercice choisi et ajoute l'Exercice précédent comme repère, pour les rattachements.
	 */
	const casDemarrage: CasUsage<EntreeDemarrage, Exercice> = {
		droit: 'parametrer',
		faire(o, e) {
			const mois = moisDebut(o);
			if (!mois.ok) return mois;
			const depotP = o.depots.parametrage;
			let exercices = o.depots.exercices.lister();

			let exercice = exercices.find((x) => x.statut !== 'repere') ?? null;
			if (exercice === null) {
				const decision = deciderPremierExercice(exercices, e.anneeDebut, mois.valeur);
				if (!decision.ok) return decision;
				const cree = creerExercice(o, decision.valeur);
				if (!cree.ok) return cree;
				exercice = cree.valeur;
				const precedent = libelleExercice(e.anneeDebut - 1, mois.valeur);
				const repere = deciderRepere(o.depots.exercices.lister(), precedent);
				if (repere.ok) creerExercice(o, repere.valeur);
				exercices = o.depots.exercices.lister();
			}

			for (const c of e.comptes) {
				const comptes = depotP.comptes();
				const libre = libelleDisponible(c.libelle, comptes, c.id);
				if (!libre.ok) return echec(libre.erreur.code, { champ: 'comptes', libelle: c.libelle });

				let compte = comptes.find((x) => x.id === c.id);
				if (compte === undefined) {
					const id = depotP.creerCompte({
						libelle: c.libelle,
						type: c.type,
						ordre: prochainOrdre(comptes)
					});
					o.noter({
						evenement: 'compte.cree',
						entiteType: 'compte',
						entiteId: id,
						resume: `a créé le Compte ${c.libelle}.`,
						apres: { libelle: c.libelle, type: c.type }
					});
					compte = depotP.comptes().find((x) => x.id === id);
				} else if (compte.libelle !== c.libelle) {
					depotP.modifierCompte(compte.id, { libelle: c.libelle, type: compte.type });
					o.noter({
						evenement: 'compte.modifie',
						entiteType: 'compte',
						entiteId: compte.id,
						resume: `a renommé le Compte ${compte.libelle} en ${c.libelle}.`
					});
				}
				const ancre = poserAncre(
					o,
					{ id: (compte as { id: number }).id, libelle: c.libelle },
					exercices,
					exercice.id,
					c.solde
				);
				if (!ancre.ok) return ancre;
			}
			depotP.definirEtapeAssistant(3);
			o.noter({
				evenement: 'assistant.comptes_prepares',
				entiteType: 'exercice',
				entiteId: exercice.id,
				resume: `a préparé les Comptes de ${exercice.libelle}.`
			});
			return succes(exercice);
		}
	};

	return {
		lister(ctx: Ctx): Resultat<Exercice[]> {
			return lire(ctx, 'etre_connecte', () => depot.lister());
		},

		/** Exercice affiché : `?exercice=` s'il existe, sinon l'Exercice ouvert le plus récent. */
		selection(ctx: Ctx, libelle: string | null): Resultat<Exercice | null> {
			return lire(ctx, 'etre_connecte', () => exerciceSelectionne(depot.lister(), libelle));
		},

		/** Année proposée par l'assistant : celle de l'Exercice en cours aujourd'hui. */
		anneeCourante(ctx: Ctx, mois: number): number {
			return anneeExerciceDe(ctx.aujourdhui, mois);
		},

		ouvrirPremier: (ctx: Ctx, e: { anneeDebut: number; soldes: SoldeCompte[] }) =>
			executer(casPremier, ctx, e),
		ouvrirSuivant: (ctx: Ctx) => executer(casSuivant, ctx, undefined),
		ajouterRepere: (ctx: Ctx, libelle: string) => executer(casRepere, ctx, libelle),
		enregistrerBalance: (ctx: Ctx, e: { exerciceId: number; soldes: SoldeCompte[] }) =>
			executer(casBalance, ctx, e),
		demarrer: (ctx: Ctx, e: EntreeDemarrage) => executer(casDemarrage, ctx, e)
	};
}

export type ModuleExercices = ReturnType<typeof creerExercices>;
