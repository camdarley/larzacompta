import type { Exercice } from '#lib/domaine/exercices.ts';
import { deciderAncre } from '#lib/domaine/exercices.ts';
import {
	ACTIONS_TYPE,
	GROUPE_ACTIONS,
	GROUPE_SYSTEME,
	GROUPES_TYPE,
	NATURES_SYSTEME,
	NATURES_TYPE
} from '#lib/domaine/liste-type.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import { formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
import {
	COMPTE_CHEQUES,
	comptesTenus,
	deplacer,
	libelleDisponible,
	prochainOrdre,
	soldeAncre,
	type Action,
	type Ancre,
	type Association,
	type Compte,
	type Groupe,
	type Nature,
	type TypeCompte
} from '#lib/domaine/parametrage.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import { AVANT_TOUT, reajusterEcartOuverture } from '../caisses/ecart.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';

const FIN_DES_TEMPS = '9999-12-31';

export type CompteVue = Compte & { utilise: boolean; ancre: Ancre | null };
export type NatureVue = Nature & { utilisee: boolean };
export type ActionVue = Action & { utilisee: boolean };
export type GroupeVue = Groupe & { utilise: boolean };

export type SoldeDepartVue = { compte: Compte; solde: Centimes };

export type EntreeAssociation = Omit<Association, 'etapeAssistant'>;
export type EntreeCompte = {
	libelle: string;
	type: TypeCompte;
	/** Caisse de réserve : sans Session ni Action (FR-16). */
	reserve?: boolean;
	/** Solde de départ : au début d'un Exercice ouvert (E6). */
	ancre?: { exerciceId: number; solde: Centimes };
};
export type EntreeNature = { libelle: string; groupeId: number; neutre: boolean };
export type EntreeAction = { libelle: string; groupeId: number; avecCaisse: boolean };
export type SelectionListeType = { natures: string[]; actions: string[] };

/** Groupes par défaut et Natures système : présents dès que l'APE existe, quoi qu'on coche ensuite. */
function assurerSocle(o: Outils) {
	const depot = o.depots.parametrage;
	const groupes = depot.groupes();
	GROUPES_TYPE.forEach((libelle, i) => {
		if (!groupes.some((g) => g.libelle === libelle)) {
			depot.creerGroupe({ libelle, ordre: groupes.length + i + 1 });
		}
	});
	const fonctionnement = depot.groupes().find((g) => g.libelle === GROUPE_SYSTEME) as Groupe;
	const natures = depot.natures();
	for (const n of NATURES_SYSTEME) {
		if (!natures.some((x) => x.codeSysteme === n.code)) {
			depot.creerNature({
				libelle: n.libelle,
				groupeId: fonctionnement.id,
				neutre: n.neutre,
				codeSysteme: n.code
			});
		}
	}
}

/** Après les Comptes de l'APE : une instance qui démarre reçoit aussi celui des chèques. */
export function assurerCompteCheques(o: Outils) {
	const depot = o.depots.parametrage;
	if (!depot.comptes().some((c) => c.type === COMPTE_CHEQUES.type)) {
		depot.creerCompte({ ...COMPTE_CHEQUES });
	}
}

/** Écrit une ancre dans la transaction de l'appelant : seul chemin vers `balance_ouverture` (AD-7). */
export function poserAncre(
	o: Outils,
	compte: { id: number; libelle: string },
	exercices: readonly Exercice[],
	exerciceId: number,
	solde: Centimes
): Resultat<true> {
	const actuelle = o.depots.parametrage.ancres().find((a) => a.compteId === compte.id);
	const j = o.depots.operations.journal();
	const dates = [
		...j.operations.flatMap((op) =>
			op.cotes.filter((c) => c.compteId === compte.id).map((c) => c.date)
		),
		...j.lignesReleve.filter((l) => l.compteId === compte.id).map((l) => l.date)
	].sort();
	const decision = deciderAncre(
		exercices,
		exerciceId,
		actuelle?.exerciceId ?? null,
		dates[0] ?? null
	);
	if (!decision.ok) return decision;
	if (actuelle?.solde === solde && actuelle.exerciceId === exerciceId) return succes(true);
	o.depots.parametrage.ecrireAncre(compte.id, exerciceId, solde);
	o.noter({
		evenement: 'balance.modifiee',
		entiteType: 'compte',
		entiteId: compte.id,
		resume: `a posé le solde de départ de ${compte.libelle} pour ${decision.valeur.libelle}.`,
		avant: actuelle ? { solde: actuelle.solde } : undefined,
		apres: { solde }
	});
	return succes(true);
}

/** Un Compte qui porte encore de l'argent ou des lignes à pointer reste au Tableau de contrôle. */
function refusDesactivation(o: Outils, id: number): Resultat<true> {
	const j = o.depots.operations.journal();
	const solde = soldeCompte(j, id, FIN_DES_TEMPS);
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	const aPointer = j.lignesReleve.some((l) => l.compteId === id && !pointees.has(l.id));
	if (solde === 0 && !aPointer) return succes(true);
	return echec('compte_non_vide', { montant: formaterMontant(solde) });
}

function compte(n: number, nom: string) {
	return `${n} ${nom}${n > 1 ? 's' : ''}`;
}

function trouver<T extends { id: number }>(liste: readonly T[], id: number): Resultat<T> {
	const e = liste.find((x) => x.id === id);
	return e ? succes(e) : echec('element_introuvable');
}

export function creerParametrage(socle: Socle, executer: Executer, lire: Lire) {
	const depot = socle.depots.parametrage;

	const casAssociation: CasUsage<EntreeAssociation, true> = {
		droit: 'parametrer',
		faire(o, e) {
			const avant = o.depots.parametrage.association();
			o.depots.parametrage.ecrireAssociation(e);
			assurerSocle(o);
			if (avant === null) o.depots.parametrage.definirEtapeAssistant(2);
			o.noter({
				evenement: avant ? 'association.modifiee' : 'association.creee',
				entiteType: 'association',
				entiteId: 1,
				resume: avant ? 'a modifié l’identité de l’APE.' : `a décrit l’APE ${e.nom}.`,
				avant: avant ?? undefined,
				apres: e
			});
			return succes(true);
		}
	};

	const casEtape: CasUsage<number, true> = {
		droit: 'parametrer',
		sansJournal: true,
		faire(o, etape) {
			if (o.depots.parametrage.association() === null) return echec('association_absente');
			o.depots.parametrage.definirEtapeAssistant(etape);
			return succes(true);
		}
	};

	const casCreerCompte: CasUsage<EntreeCompte, number> = {
		droit: 'parametrer',
		faire(o, e) {
			const comptes = o.depots.parametrage.comptes();
			const libre = libelleDisponible(e.libelle, comptes);
			if (!libre.ok) return libre;
			const id = o.depots.parametrage.creerCompte({
				libelle: e.libelle,
				type: e.type,
				ordre: prochainOrdre(comptesTenus(comptes)),
				reserve: e.type === 'caisse' && e.reserve === true
			});
			o.noter({
				evenement: 'compte.cree',
				entiteType: 'compte',
				entiteId: id,
				resume: `a créé le Compte ${e.libelle}.`,
				apres: { libelle: e.libelle, type: e.type }
			});
			if (e.ancre) {
				const compte = { id, libelle: e.libelle };
				const exercices = o.depots.exercices.lister();
				const r = poserAncre(o, compte, exercices, e.ancre.exerciceId, e.ancre.solde);
				if (!r.ok) return r;
			}
			return succes(id);
		}
	};

	const casModifierCompte: CasUsage<EntreeCompte & { id: number }, true> = {
		droit: 'parametrer',
		faire(o, { id, ...e }) {
			const comptes = o.depots.parametrage.comptes();
			const compte = trouver(comptes, id);
			if (!compte.ok) return compte;
			const libre = libelleDisponible(e.libelle, comptes, id);
			if (!libre.ok) return libre;
			// Le type d'un Compte qui porte des mouvements ne change plus.
			const type = o.depots.parametrage.compteUtilise(id) ? compte.valeur.type : e.type;
			const sessions = o.depots.operations.journal().sessions;
			// Une caisse qui a déjà tenu une Session ne devient pas une réserve (C1).
			const reserve =
				type === 'caisse' &&
				(sessions.some((s) => s.compteId === id) ? false : (e.reserve ?? compte.valeur.reserve));
			o.depots.parametrage.modifierCompte(id, { libelle: e.libelle, type, reserve });
			o.noter({
				evenement: 'compte.modifie',
				entiteType: 'compte',
				entiteId: id,
				resume:
					compte.valeur.libelle === e.libelle
						? `a modifié le Compte ${e.libelle}.`
						: `a renommé le Compte ${compte.valeur.libelle} en ${e.libelle}.`,
				avant: compte.valeur,
				apres: { libelle: e.libelle, type, reserve }
			});
			if (e.ancre) {
				const exercices = o.depots.exercices.lister();
				const r = poserAncre(
					o,
					{ id, libelle: e.libelle },
					exercices,
					e.ancre.exerciceId,
					e.ancre.solde
				);
				if (!r.ok) return r;
				const ecart = reajusterEcartOuverture(o, [{ compteId: id, date: AVANT_TOUT }]);
				if (!ecart.ok) return ecart;
			}
			return succes(true);
		}
	};

	const casActiverCompte: CasUsage<{ id: number; actif: boolean }, true> = {
		droit: 'parametrer',
		faire(o, { id, actif }) {
			const compte = trouver(comptesTenus(o.depots.parametrage.comptes()), id);
			if (!compte.ok) return compte;
			if (!actif) {
				const non = refusDesactivation(o, id);
				if (!non.ok) return non;
			}
			o.depots.parametrage.activerCompte(id, actif);
			o.noter({
				evenement: actif ? 'compte.reactive' : 'compte.desactive',
				entiteType: 'compte',
				entiteId: id,
				resume: `a ${actif ? 'réactivé' : 'désactivé'} le Compte ${compte.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casSupprimerCompte: CasUsage<number, true> = {
		droit: 'parametrer',
		faire(o, id) {
			const compte = trouver(comptesTenus(o.depots.parametrage.comptes()), id);
			if (!compte.ok) return compte;
			if (o.depots.parametrage.compteUtilise(id)) return echec('element_utilise');
			o.depots.parametrage.supprimerCompte(id);
			o.noter({
				evenement: 'compte.supprime',
				entiteType: 'compte',
				entiteId: id,
				resume: `a supprimé le Compte ${compte.valeur.libelle}.`,
				avant: compte.valeur
			});
			return succes(true);
		}
	};

	const casDeplacerCompte: CasUsage<{ id: number; sens: 'monter' | 'descendre' }, true> = {
		droit: 'parametrer',
		faire(o, { id, sens }) {
			const comptes = comptesTenus(o.depots.parametrage.comptes());
			const compte = trouver(comptes, id);
			if (!compte.ok) return compte;
			for (const m of deplacer(comptes, id, sens)) {
				o.depots.parametrage.definirOrdreCompte(m.id, m.ordre);
			}
			o.noter({
				evenement: 'compte.deplace',
				entiteType: 'compte',
				entiteId: id,
				resume: `a changé l’ordre du Compte ${compte.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casCreerGroupe: CasUsage<string, number> = {
		droit: 'parametrer',
		faire(o, libelle) {
			const groupes = o.depots.parametrage.groupes();
			const libre = libelleDisponible(libelle, groupes);
			if (!libre.ok) return libre;
			const id = o.depots.parametrage.creerGroupe({ libelle, ordre: prochainOrdre(groupes) });
			o.noter({
				evenement: 'groupe.cree',
				entiteType: 'groupe',
				entiteId: id,
				resume: `a créé le Groupe ${libelle}.`
			});
			return succes(id);
		}
	};

	const casRenommerGroupe: CasUsage<{ id: number; libelle: string }, true> = {
		droit: 'parametrer',
		faire(o, { id, libelle }) {
			const groupes = o.depots.parametrage.groupes();
			const groupe = trouver(groupes, id);
			if (!groupe.ok) return groupe;
			const libre = libelleDisponible(libelle, groupes, id);
			if (!libre.ok) return libre;
			o.depots.parametrage.renommerGroupe(id, libelle);
			o.noter({
				evenement: 'groupe.renomme',
				entiteType: 'groupe',
				entiteId: id,
				resume: `a renommé le Groupe ${groupe.valeur.libelle} en ${libelle}.`
			});
			return succes(true);
		}
	};

	const casDeplacerGroupe: CasUsage<{ id: number; sens: 'monter' | 'descendre' }, true> = {
		droit: 'parametrer',
		faire(o, { id, sens }) {
			const groupes = o.depots.parametrage.groupes();
			const groupe = trouver(groupes, id);
			if (!groupe.ok) return groupe;
			for (const m of deplacer(groupes, id, sens)) {
				o.depots.parametrage.definirOrdreGroupe(m.id, m.ordre);
			}
			o.noter({
				evenement: 'groupe.deplace',
				entiteType: 'groupe',
				entiteId: id,
				resume: `a changé l’ordre du Groupe ${groupe.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casSupprimerGroupe: CasUsage<number, true> = {
		droit: 'parametrer',
		faire(o, id) {
			const groupe = trouver(o.depots.parametrage.groupes(), id);
			if (!groupe.ok) return groupe;
			if (o.depots.parametrage.groupeUtilise(id)) return echec('groupe_utilise');
			o.depots.parametrage.supprimerGroupe(id);
			o.noter({
				evenement: 'groupe.supprime',
				entiteType: 'groupe',
				entiteId: id,
				resume: `a supprimé le Groupe ${groupe.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	function controlerGroupe(o: Outils, groupeId: number) {
		return trouver(o.depots.parametrage.groupes(), groupeId);
	}

	const casCreerNature: CasUsage<EntreeNature, number> = {
		droit: 'parametrer',
		faire(o, e) {
			const libre = libelleDisponible(e.libelle, o.depots.parametrage.natures());
			if (!libre.ok) return libre;
			const groupe = controlerGroupe(o, e.groupeId);
			if (!groupe.ok) return groupe;
			const id = o.depots.parametrage.creerNature({ ...e, codeSysteme: null });
			o.noter({
				evenement: 'nature.creee',
				entiteType: 'nature',
				entiteId: id,
				resume: `a créé la Nature ${e.libelle}.`,
				apres: e
			});
			return succes(id);
		}
	};

	const casModifierNature: CasUsage<EntreeNature & { id: number }, true> = {
		droit: 'parametrer',
		faire(o, { id, ...e }) {
			const natures = o.depots.parametrage.natures();
			const nature = trouver(natures, id);
			if (!nature.ok) return nature;
			if (nature.valeur.codeSysteme !== null) return echec('element_systeme');
			const libre = libelleDisponible(e.libelle, natures, id);
			if (!libre.ok) return libre;
			const groupe = controlerGroupe(o, e.groupeId);
			if (!groupe.ok) return groupe;
			o.depots.parametrage.modifierNature(id, e);
			o.noter({
				evenement: 'nature.modifiee',
				entiteType: 'nature',
				entiteId: id,
				resume:
					nature.valeur.libelle === e.libelle
						? `a modifié la Nature ${e.libelle}.`
						: `a renommé la Nature ${nature.valeur.libelle} en ${e.libelle}.`,
				avant: nature.valeur,
				apres: e
			});
			return succes(true);
		}
	};

	const casActiverNature: CasUsage<{ id: number; actif: boolean }, true> = {
		droit: 'parametrer',
		faire(o, { id, actif }) {
			const nature = trouver(o.depots.parametrage.natures(), id);
			if (!nature.ok) return nature;
			if (nature.valeur.codeSysteme !== null) return echec('element_systeme');
			o.depots.parametrage.activerNature(id, actif);
			o.noter({
				evenement: actif ? 'nature.reactivee' : 'nature.desactivee',
				entiteType: 'nature',
				entiteId: id,
				resume: `a ${actif ? 'réactivé' : 'désactivé'} la Nature ${nature.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casSupprimerNature: CasUsage<number, true> = {
		droit: 'parametrer',
		faire(o, id) {
			const nature = trouver(o.depots.parametrage.natures(), id);
			if (!nature.ok) return nature;
			if (nature.valeur.codeSysteme !== null) return echec('element_systeme');
			if (o.depots.parametrage.natureUtilisee(id)) return echec('element_utilise');
			o.depots.parametrage.supprimerNature(id);
			o.noter({
				evenement: 'nature.supprimee',
				entiteType: 'nature',
				entiteId: id,
				resume: `a supprimé la Nature ${nature.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casCreerAction: CasUsage<EntreeAction, number> = {
		droit: 'parametrer',
		faire(o, e) {
			const libre = libelleDisponible(e.libelle, o.depots.parametrage.actions());
			if (!libre.ok) return libre;
			const groupe = controlerGroupe(o, e.groupeId);
			if (!groupe.ok) return groupe;
			const id = o.depots.parametrage.creerAction(e);
			o.noter({
				evenement: 'action.creee',
				entiteType: 'action',
				entiteId: id,
				resume: `a créé l’Action ${e.libelle}.`,
				apres: e
			});
			return succes(id);
		}
	};

	const casModifierAction: CasUsage<EntreeAction & { id: number }, true> = {
		droit: 'parametrer',
		faire(o, { id, ...e }) {
			const actions = o.depots.parametrage.actions();
			const action = trouver(actions, id);
			if (!action.ok) return action;
			const libre = libelleDisponible(e.libelle, actions, id);
			if (!libre.ok) return libre;
			const groupe = controlerGroupe(o, e.groupeId);
			if (!groupe.ok) return groupe;
			o.depots.parametrage.modifierAction(id, e);
			o.noter({
				evenement: 'action.modifiee',
				entiteType: 'action',
				entiteId: id,
				resume:
					action.valeur.libelle === e.libelle
						? `a modifié l’Action ${e.libelle}.`
						: `a renommé l’Action ${action.valeur.libelle} en ${e.libelle}.`,
				avant: action.valeur,
				apres: e
			});
			return succes(true);
		}
	};

	const casActiverAction: CasUsage<{ id: number; actif: boolean }, true> = {
		droit: 'parametrer',
		faire(o, { id, actif }) {
			const action = trouver(o.depots.parametrage.actions(), id);
			if (!action.ok) return action;
			o.depots.parametrage.activerAction(id, actif);
			o.noter({
				evenement: actif ? 'action.reactivee' : 'action.desactivee',
				entiteType: 'action',
				entiteId: id,
				resume: `a ${actif ? 'réactivé' : 'désactivé'} l’Action ${action.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casSupprimerAction: CasUsage<number, true> = {
		droit: 'parametrer',
		faire(o, id) {
			const action = trouver(o.depots.parametrage.actions(), id);
			if (!action.ok) return action;
			if (o.depots.parametrage.actionUtilisee(id)) return echec('element_utilise');
			o.depots.parametrage.supprimerAction(id);
			o.noter({
				evenement: 'action.supprimee',
				entiteType: 'action',
				entiteId: id,
				resume: `a supprimé l’Action ${action.valeur.libelle}.`
			});
			return succes(true);
		}
	};

	const casListeType: CasUsage<SelectionListeType, { natures: number; actions: number }> = {
		droit: 'parametrer',
		faire(o, selection) {
			if (o.depots.parametrage.association() === null) return echec('association_absente');
			assurerSocle(o);
			const groupes = o.depots.parametrage.groupes();
			const groupeId = (libelle: string) =>
				(groupes.find((g) => g.libelle === libelle) as Groupe).id;
			const natures = o.depots.parametrage.natures();
			const actions = o.depots.parametrage.actions();

			const naturesAjoutees = NATURES_TYPE.filter(
				(n) => selection.natures.includes(n.libelle) && libelleDisponible(n.libelle, natures).ok
			);
			for (const n of naturesAjoutees) {
				o.depots.parametrage.creerNature({
					libelle: n.libelle,
					groupeId: groupeId(n.groupe),
					neutre: false,
					codeSysteme: null
				});
			}
			const actionsAjoutees = ACTIONS_TYPE.filter(
				(a) => selection.actions.includes(a.libelle) && libelleDisponible(a.libelle, actions).ok
			);
			for (const a of actionsAjoutees) {
				o.depots.parametrage.creerAction({
					libelle: a.libelle,
					groupeId: groupeId(a.groupe),
					avecCaisse: a.avecCaisse
				});
			}
			o.noter({
				evenement: 'liste_type.appliquee',
				entiteType: 'association',
				entiteId: 1,
				resume: `a appliqué la liste type : ${compte(naturesAjoutees.length, 'Nature')}, ${compte(actionsAjoutees.length, 'Action')}.`
			});
			return succes({ natures: naturesAjoutees.length, actions: actionsAjoutees.length });
		}
	};

	function groupeParDefaut(libelle: string): number | null {
		const groupes = depot.groupes();
		return (groupes.find((g) => g.libelle === libelle) ?? groupes[0])?.id ?? null;
	}

	return {
		/** Identité publique : le nom de l'APE figure sur la page de connexion. */
		association: () => depot.association(),

		/** Fiche complète de Réglages : gardée, le masque d'invalidation de Kit saute le layout (AD-15). */
		fiche(ctx: Ctx) {
			return lire(ctx, 'parametrer', () => depot.association());
		},

		/** Soldes de départ d'un Exercice, pour les Comptes ancrés à cet Exercice ou avant. */
		soldesDepart(ctx: Ctx, exerciceId: number): Resultat<SoldeDepartVue[]> {
			return lire(ctx, 'consulter', () => {
				const exercices = socle.depots.exercices.lister();
				const cible = exercices.find((e) => e.id === exerciceId);
				const ancres = depot.ancres();
				return comptesTenus(depot.comptes())
					.filter((c) => c.actif)
					.flatMap((c) => {
						const ancre = ancres.find((a) => a.compteId === c.id);
						const debut = exercices.find((e) => e.id === ancre?.exerciceId);
						if (cible && debut && debut.anneeDebut > cible.anneeDebut) return [];
						return [{ compte: c, solde: soldeAncre(ancre?.solde) }];
					});
			});
		},

		enregistrerAssociation: (ctx: Ctx, e: EntreeAssociation) => executer(casAssociation, ctx, e),
		definirEtapeAssistant: (ctx: Ctx, etape: number) => executer(casEtape, ctx, etape),

		comptes(ctx: Ctx): Resultat<CompteVue[]> {
			return lire(ctx, 'parametrer', () => {
				const ancres = depot.ancres();
				return comptesTenus(depot.comptes()).map((c) => ({
					...c,
					utilise: depot.compteUtilise(c.id),
					ancre: ancres.find((a) => a.compteId === c.id) ?? null
				}));
			});
		},
		creerCompte: (ctx: Ctx, e: EntreeCompte) => executer(casCreerCompte, ctx, e),
		modifierCompte: (ctx: Ctx, e: EntreeCompte & { id: number }) =>
			executer(casModifierCompte, ctx, e),
		activerCompte: (ctx: Ctx, id: number, actif: boolean) =>
			executer(casActiverCompte, ctx, { id, actif }),
		supprimerCompte: (ctx: Ctx, id: number) => executer(casSupprimerCompte, ctx, id),
		deplacerCompte: (ctx: Ctx, id: number, sens: 'monter' | 'descendre') =>
			executer(casDeplacerCompte, ctx, { id, sens }),

		groupes(ctx: Ctx): Resultat<GroupeVue[]> {
			return lire(ctx, 'parametrer', () =>
				depot.groupes().map((g) => ({ ...g, utilise: depot.groupeUtilise(g.id) }))
			);
		},
		creerGroupe: (ctx: Ctx, libelle: string) => executer(casCreerGroupe, ctx, libelle),
		renommerGroupe: (ctx: Ctx, id: number, libelle: string) =>
			executer(casRenommerGroupe, ctx, { id, libelle }),
		deplacerGroupe: (ctx: Ctx, id: number, sens: 'monter' | 'descendre') =>
			executer(casDeplacerGroupe, ctx, { id, sens }),
		supprimerGroupe: (ctx: Ctx, id: number) => executer(casSupprimerGroupe, ctx, id),

		natures(ctx: Ctx): Resultat<NatureVue[]> {
			return lire(ctx, 'parametrer', () =>
				depot.natures().map((n) => ({ ...n, utilisee: depot.natureUtilisee(n.id) }))
			);
		},
		creerNature: (ctx: Ctx, e: EntreeNature) => executer(casCreerNature, ctx, e),
		/** Depuis `selecteur-recherche` : le Groupe se corrige ensuite dans Réglages. */
		creerNatureVolee(ctx: Ctx, libelle: string): Resultat<{ id: number; libelle: string }> {
			const groupe = groupeParDefaut(GROUPE_SYSTEME);
			if (groupe === null) return echec('association_absente');
			const r = executer(casCreerNature, ctx, { libelle, groupeId: groupe, neutre: false });
			return r.ok ? succes({ id: r.valeur, libelle }) : r;
		},
		modifierNature: (ctx: Ctx, e: EntreeNature & { id: number }) =>
			executer(casModifierNature, ctx, e),
		activerNature: (ctx: Ctx, id: number, actif: boolean) =>
			executer(casActiverNature, ctx, { id, actif }),
		supprimerNature: (ctx: Ctx, id: number) => executer(casSupprimerNature, ctx, id),

		actions(ctx: Ctx): Resultat<ActionVue[]> {
			return lire(ctx, 'parametrer', () =>
				depot.actions().map((a) => ({ ...a, utilisee: depot.actionUtilisee(a.id) }))
			);
		},
		creerAction: (ctx: Ctx, e: EntreeAction) => executer(casCreerAction, ctx, e),
		creerActionVolee(ctx: Ctx, libelle: string): Resultat<{ id: number; libelle: string }> {
			const groupe = groupeParDefaut(GROUPE_ACTIONS);
			if (groupe === null) return echec('association_absente');
			const r = executer(casCreerAction, ctx, { libelle, groupeId: groupe, avecCaisse: false });
			return r.ok ? succes({ id: r.valeur, libelle }) : r;
		},
		modifierAction: (ctx: Ctx, e: EntreeAction & { id: number }) =>
			executer(casModifierAction, ctx, e),
		activerAction: (ctx: Ctx, id: number, actif: boolean) =>
			executer(casActiverAction, ctx, { id, actif }),
		supprimerAction: (ctx: Ctx, id: number) => executer(casSupprimerAction, ctx, id),

		appliquerListeType: (ctx: Ctx, selection: SelectionListeType) =>
			executer(casListeType, ctx, selection)
	};
}

export type ModuleParametrage = ReturnType<typeof creerParametrage>;
