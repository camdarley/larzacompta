/**
 * Seul module qui écrit le relevé, le Constat et le Pointage (AD-7).
 * Seul `pointer` crée un Pointage, toujours à partir d'une action explicite (AD-8).
 */
import { formaterDateCourte, type DateCivile } from '#lib/domaine/dates.ts';
import { exerciceDeDate } from '#lib/domaine/etats/soldes.ts';
import type { GrandJournal, LigneReleveJ } from '#lib/domaine/journal.ts';
import { centimes, formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
import type { Brouillon } from '#lib/domaine/operations/validation.ts';
import { rechercher } from '#lib/domaine/recherche/index.ts';
import {
	appliquerReglage,
	reglagePropose,
	type ReglageCsv,
	type TableauCsv
} from '#lib/domaine/releve/csv.ts';
import {
	planifierImport,
	planifierSaisie,
	type PlanImport
} from '#lib/domaine/releve/planifier.ts';
import {
	dateDepuisLigne,
	deciderAnnulationPointage,
	deciderPointage,
	deciderRetrait,
	differencePointage,
	type DemandePointage
} from '#lib/domaine/releve/pointage.ts';
import { cotesOuverts, libelleDuCote } from '#lib/domaine/releve/proposer.ts';
import { trous, type Trou } from '#lib/domaine/releve/trous.ts';
import type { ReleveNormalise } from '#lib/domaine/releve/types.ts';
import {
	comptesPointables,
	ligneASaisir,
	lignesAPointer,
	vuePointage,
	type ComptePointable,
	type ElementRelie,
	type LigneASaisir,
	type Recapitulatif,
	type VuePointage
} from '#lib/domaine/releve/vues.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import {
	annulerOperation,
	ecrireOperation,
	versBrouillon,
	type EntreeOperation
} from '../operations/index.ts';
import { rattacherPieces } from '../pieces/index.ts';

export type EntreeImport = {
	compteId: number;
	nomFichier: string;
	octets: Uint8Array;
	/** Réglage validé à l'écran de correspondance. Sinon, celui du Compte. */
	reglage?: ReglageCsv | null;
	/** Confirmé à l'écran : le fichier porte un autre numéro de compte que les précédents. */
	autreCompte?: boolean;
};

export type DemandeCorrespondance = {
	type: 'correspondance';
	tableau: TableauCsv;
	reglage: ReglageCsv;
	/** Colonne disparue depuis le dernier import. */
	colonneAbsente: string | null;
};

export type ResultatImport = Recapitulatif | DemandeCorrespondance;

export type EntreeLigne = {
	compteId: number;
	date: DateCivile;
	montant: Centimes;
	libelle: string;
};

export type EntreeSolde = { compteId: number; date: DateCivile; solde: Centimes };

export type EntreeDepuisLigne = {
	ligneId: number;
	saisie: EntreeOperation;
	cle?: string;
	pieces?: number[];
};

export type CandidatPointage = ElementRelie & { coteId: number };

export type PagePointage = VuePointage & {
	compte: ComptePointable;
	comptes: ComptePointable[];
};

const acteur = (o: Pick<Outils, 'ctx'>) => (o.ctx.acces as NonNullable<Ctx['acces']>).id;
const nouvellesLignes = (n: number) => (n > 1 ? `${n} lignes nouvelles` : `${n} ligne nouvelle`);

function compteDe(j: GrandJournal, id: number) {
	return comptesPointables(j).find((c) => c.id === id);
}

/** Première date admise par le contrôle : le début de l'Exercice de l'ancre (P6). */
function premierJour(j: GrandJournal, compteId: number): DateCivile | null {
	const ancre = j.ancres.find((a) => a.compteId === compteId);
	return j.exercices.find((e) => e.id === ancre?.exerciceId)?.debut ?? null;
}

/** Hors contrôle : dans un Exercice clôturé, ou avant l'ancre (P6). */
function soldeHorsControle(j: GrandJournal, compteId: number, date: DateCivile) {
	const debut = premierJour(j, compteId);
	return (
		exerciceDeDate(j.exercices, date)?.statut === 'cloture' || (debut !== null && date < debut)
	);
}

/** Le solde lu devient un Constat, sauf s'il est déjà connu ou hors contrôle. */
function soldeAEcrire(j: GrandJournal, compteId: number, releve: ReleveNormalise) {
	const solde = releve.solde;
	if (solde === null) return { ecrire: null, ignore: false };
	if (soldeHorsControle(j, compteId, solde.date)) return { ecrire: null, ignore: true };
	const connu = j.constats.some(
		(c) => c.compteId === compteId && c.date === solde.date && c.solde === solde.montant
	);
	return { ecrire: connu ? null : solde, ignore: false };
}

function recapitulatif(
	plan: PlanImport,
	releve: ReleveNormalise,
	soldeIgnore: boolean,
	trou: Trou | null
): Recapitulatif {
	const nouvelles = plan.nouvelles.length;
	return {
		type: 'recapitulatif',
		lues: plan.lues,
		nouvelles,
		connues: plan.connues,
		ecartees: plan.ecartees,
		aConfirmer: plan.nouvelles.filter((l) => l.doublon === 'a_confirmer').length,
		identifiantsRepetes: plan.nouvelles.filter((l) => l.identifiantRepete).length,
		soldeIgnore,
		soldeDemande:
			releve.solde === null && plan.dateMax !== null && nouvelles > 0
				? { date: plan.dateMax }
				: null,
		trou
	};
}

function ecrirePointage(o: Outils, d: DemandePointage): Resultat<{ id: number }> {
	const j = o.depots.operations.journal();
	const decision = deciderPointage(j, d);
	if (!decision.ok) return decision;
	const id = o.depots.pointage.creerPointage({
		...d,
		creeLe: o.ctx.maintenant,
		creePar: acteur(o)
	});
	const lignes = j.lignesReleve.filter((l) => d.ligneIds.includes(l.id));
	const [premiere] = lignes;
	o.noter({
		evenement: 'pointage.cree',
		entiteType: 'pointage',
		entiteId: id,
		resume:
			lignes.length === 1 && premiere
				? `a pointé « ${premiere.libelle} » de ${formaterMontant(premiere.montant)}.`
				: `a pointé ${lignes.length} Lignes de relevé.`,
		apres: d
	});
	return succes({ id });
}

export function creerPointage(socle: Socle, executer: Executer, lire: Lire) {
	const depots = socle.depots;
	const journal = () => depots.operations.journal();

	const casImport: CasUsage<
		EntreeImport & { format: string; releve: ReleveNormalise; plan: PlanImport },
		Recapitulatif
	> = {
		droit: 'saisir',
		faire(o, e) {
			const depot = o.depots.pointage;
			const j = o.depots.operations.journal();
			const { ecrire, ignore } = soldeAEcrire(j, e.compteId, e.releve);
			const nouvelles = e.plan.nouvelles;

			if (e.reglage) {
				depot.ecrireProfil(e.compteId, e.reglage);
				o.noter({
					evenement: 'releve.reglage',
					entiteType: 'compte',
					entiteId: e.compteId,
					resume: `a retenu les colonnes du fichier « ${e.nomFichier} ».`,
					apres: e.reglage
				});
			}

			let importId: number | null = null;
			if (nouvelles.length > 0 || ecrire !== null) {
				// Écrit puis renommé avant le commit : le fichier existe toujours avant sa référence.
				const fichierSha256 = socle.fichiers.ecrire(e.octets);
				importId = depot.creerImport({
					compteId: e.compteId,
					source: e.format,
					nomFichier: e.nomFichier,
					compteSource: e.releve.compte ?? null,
					fichierSha256,
					dateMin: e.plan.dateMin,
					dateMax: e.plan.dateMax,
					lues: e.plan.lues,
					nouvelles: nouvelles.length,
					connues: e.plan.connues,
					importeLe: o.ctx.maintenant,
					importePar: acteur(o)
				});
				for (const l of nouvelles) {
					depot.creerLigne({
						...l,
						compteId: e.compteId,
						importId,
						creeLe: o.ctx.maintenant
					});
				}
				if (ecrire !== null) {
					depot.creerConstat({
						compteId: e.compteId,
						date: ecrire.date,
						solde: ecrire.montant,
						source: 'releve',
						importId,
						creeLe: o.ctx.maintenant,
						creePar: acteur(o)
					});
				}
				o.noter({
					evenement: 'releve.importe',
					entiteType: 'import_releve',
					entiteId: importId,
					resume: `a importé le relevé « ${e.nomFichier} » : ${nouvellesLignes(nouvelles.length)} sur ${e.plan.lues}.`,
					apres: { lues: e.plan.lues, nouvelles: nouvelles.length, connues: e.plan.connues }
				});
			}

			const periodes = importId === null ? [] : depot.periodes(e.compteId);
			const touche = trous(periodes).find(
				(t) => t.debut === e.plan.dateMax || t.fin === e.plan.dateMin
			);
			return succes(recapitulatif(e.plan, e.releve, ignore, touche ?? null));
		}
	};

	const casLigne: CasUsage<EntreeLigne, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const j = o.depots.operations.journal();
			if (compteDe(j, e.compteId) === undefined) return echec('pointage_incoherent');
			const debut = premierJour(j, e.compteId);
			if (debut !== null && e.date < debut) {
				return echec('ligne_avant_ancre', { champ: 'date' });
			}
			const ligne = planifierSaisie(
				{ date: e.date, montant: e.montant, libelle: e.libelle, identifiant: null },
				j.lignesReleve.filter((l) => l.compteId === e.compteId)
			);
			const id = o.depots.pointage.creerLigne({
				...ligne,
				compteId: e.compteId,
				importId: null,
				creeLe: o.ctx.maintenant
			});
			o.noter({
				evenement: 'ligne_releve.saisie',
				entiteType: 'ligne_releve',
				entiteId: id,
				resume: `a saisi la Ligne de relevé « ${e.libelle} » de ${formaterMontant(e.montant)}.`,
				apres: ligne
			});
			return succes({ id });
		}
	};

	const casSolde: CasUsage<EntreeSolde, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			// Avant le jalon 2, une caisse se suit par constat, sans Pointage (AD-10).
			const j = o.depots.operations.journal();
			const caisse = j.comptes.some((c) => c.id === e.compteId && c.type === 'caisse');
			if (!caisse && compteDe(j, e.compteId) === undefined) {
				return echec('pointage_incoherent');
			}
			const debut = premierJour(j, e.compteId);
			if (debut !== null && e.date < debut) return echec('ligne_avant_ancre', { champ: 'date' });
			const id = o.depots.pointage.creerConstat({
				compteId: e.compteId,
				date: e.date,
				solde: e.solde,
				source: 'saisie',
				importId: null,
				creeLe: o.ctx.maintenant,
				creePar: acteur(o)
			});
			o.noter({
				evenement: 'constat.saisi',
				entiteType: 'constat_solde',
				entiteId: id,
				resume: `a indiqué un solde de ${formaterMontant(e.solde)} au ${formaterDateCourte(e.date)}.`,
				apres: e
			});
			return succes({ id });
		}
	};

	const casConfirmer: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const ligne = o.depots.operations.journal().lignesReleve.find((l) => l.id === id);
			if (ligne === undefined) return echec('element_introuvable');
			if (ligne.doublon === 'a_confirmer') {
				o.depots.pointage.confirmerLigne(id);
			}
			o.noter({
				evenement: 'ligne_releve.confirmee',
				entiteType: 'ligne_releve',
				entiteId: id,
				resume: `a gardé la Ligne de relevé « ${ligne.libelle} ».`
			});
			return succes(true);
		}
	};

	const casRetirer: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const ligne = j.lignesReleve.find((l) => l.id === id);
			if (ligne === undefined) return echec('element_introuvable');
			const decision = deciderRetrait(j, ligne);
			if (!decision.ok) return decision;
			o.depots.pointage.supprimerLigne(id);
			o.noter({
				evenement: 'ligne_releve.ecartee',
				entiteType: 'ligne_releve',
				entiteId: id,
				resume: `a écarté la Ligne de relevé « ${ligne.libelle} ».`,
				avant: ligne
			});
			return succes(true);
		}
	};

	const casPointer: CasUsage<DemandePointage, { id: number }> = {
		droit: 'saisir',
		faire: ecrirePointage
	};

	/**
	 * Un ajustement n'existe que pour son Pointage : orphelin, il part avec lui, sinon réajuster
	 * doublerait la correction. Dans un Exercice clôturé il reste, et se relie à nouveau.
	 */
	const casAnnuler: CasUsage<number, { ajustementsAnnules: number }> = {
		droit: 'saisir',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const pointage = j.pointages.find((p) => p.id === id);
			if (pointage === undefined) return echec('element_introuvable');
			const decision = deciderAnnulationPointage(j, pointage);
			if (!decision.ok) return decision;
			o.depots.pointage.supprimerPointage(id);
			// La suppression retire le lien : le Journal en garde le contenu (AD-8).
			o.noter({
				evenement: 'pointage.annule',
				entiteType: 'pointage',
				entiteId: id,
				resume: 'a annulé un Pointage.',
				avant: pointage
			});
			const ajustements = j.operations.filter(
				(op) => op.origine === 'ajustement' && op.cotes.some((c) => pointage.coteIds.includes(c.id))
			);
			let ajustementsAnnules = 0;
			for (const op of ajustements) {
				if (annulerOperation(o, op.id).ok) ajustementsAnnules += 1;
			}
			return succes({ ajustementsAnnules });
		}
	};

	/** La différence devient une Opération dont le Côté entre dans le Pointage (P2). */
	const casAjuster: CasUsage<DemandePointage, { id: number; operationId: number }> = {
		droit: 'saisir',
		faire(o, d) {
			const depot = o.depots.operations;
			const j = depot.journal();
			const difference = differencePointage(j, d);
			if (!difference.ok) return difference;
			if (difference.valeur === 0) return echec('pointage_incoherent');

			const nature = o.depots.parametrage.natures().find((n) => n.codeSysteme === 'ajustement');
			if (nature === undefined) return echec('element_introuvable');
			const ligne = j.lignesReleve.find((l) => d.ligneIds.includes(l.id)) as LigneReleveJ;
			const dateRetenue = dateDepuisLigne(j.exercices, ligne.date);
			if (!dateRetenue.ok) return dateRetenue;
			const { date, rattachementId } = dateRetenue.valeur;

			const brouillon: Brouillon = {
				genre: 'standard',
				origine: 'ajustement',
				date,
				libelle: 'Ajustement de Pointage',
				reference: null,
				modePaiement: null,
				note: `Différence de ${formaterMontant(centimes(Math.abs(difference.valeur)))} avec « ${ligne.libelle} ».`,
				tiers: null,
				sansPiece: true,
				cotes: [{ compteId: d.compteId, date, montant: difference.valeur }],
				lignes: [
					{
						montant: difference.valeur,
						estReduction: false,
						natureId: nature.id,
						actionId: null,
						exerciceRattachementId: rattachementId,
						note: null
					}
				]
			};
			const cree = ecrireOperation(o, brouillon);
			if (!cree.ok) return cree;
			const cote = depot.parId(cree.valeur.id)?.cotes[0];
			if (cote === undefined) return echec('element_introuvable');

			const pointe = ecrirePointage(o, { ...d, coteIds: [...d.coteIds, cote.id] });
			if (!pointe.ok) return pointe;
			return succes({ id: pointe.valeur.id, operationId: cree.valeur.id });
		}
	};

	/** Opération et Pointage dans la même transaction : un échec ne laisse rien (FR-14). */
	const casDepuisLigne: CasUsage<EntreeDepuisLigne, { id: number; pointageId: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const depot = o.depots.operations;
			const ligne = depot.journal().lignesReleve.find((l) => l.id === e.ligneId);
			if (ligne === undefined) return echec('element_introuvable');
			if (ligne.doublon === 'a_confirmer') return echec('doublon_a_confirmer');

			const cree = ecrireOperation(o, versBrouillon(e.saisie), { cle: e.cle });
			if (!cree.ok) return cree;
			const cote = depot.parId(cree.valeur.id)?.cotes.find((c) => c.compteId === ligne.compteId);
			if (cote === undefined) return echec('pointage_incoherent');

			const pointe = ecrirePointage(o, {
				compteId: ligne.compteId,
				coteIds: [cote.id],
				ligneIds: [ligne.id]
			});
			if (!pointe.ok) return pointe;
			const pieces = rattacherPieces(o, e.pieces ?? [], cree.valeur.id);
			if (!pieces.ok) return pieces;
			return succes({ id: cree.valeur.id, pointageId: pointe.valeur.id });
		}
	};

	function preparerImport(
		e: EntreeImport
	): Resultat<DemandeCorrespondance | { format: string; releve: ReleveNormalise }> {
		const ofx = socle.sources.estOfx(e.octets);
		if (ofx) {
			const releve = socle.sources.ofx.lire({ octets: e.octets });
			return releve.ok ? succes({ format: 'ofx', releve: releve.valeur }) : releve;
		}
		const tableau = socle.sources.csv.tableau(e.octets);
		if (!tableau.ok) return tableau;

		const demande = (reglage: ReglageCsv, colonneAbsente: string | null) =>
			succes<DemandeCorrespondance>({
				type: 'correspondance',
				tableau: { ...tableau.valeur, lignes: tableau.valeur.lignes.slice(0, 200) },
				reglage,
				colonneAbsente
			});

		const reglage = e.reglage ?? depots.pointage.profil(e.compteId);
		if (reglage === null) return demande(reglagePropose(tableau.valeur.entetes), null);

		const releve = appliquerReglage(tableau.valeur, reglage);
		if (releve.ok) return succes({ format: 'csv', releve: releve.valeur });
		if (releve.erreur.code === 'format_change') {
			return demande(reglage, releve.erreur.details?.colonne as string);
		}
		return releve;
	}

	return {
		importer(ctx: Ctx, e: EntreeImport): Resultat<ResultatImport> {
			const lu = lire(ctx, 'saisir', () => compteDe(journal(), e.compteId) !== undefined);
			if (!lu.ok) return lu;
			if (!lu.valeur) return echec('pointage_incoherent');

			const prepare = preparerImport(e);
			if (!prepare.ok) return prepare;
			if ('type' in prepare.valeur) return succes(prepare.valeur);

			const { format, releve } = prepare.valeur;
			const dernier = depots.pointage.dernierCompteSource(e.compteId);
			if (!e.autreCompte && releve.compte && dernier !== null && dernier !== releve.compte) {
				return echec('releve_autre_compte');
			}
			const j = journal();
			const plan = planifierImport(
				releve,
				j.lignesReleve.filter((l) => l.compteId === e.compteId),
				premierJour(j, e.compteId)
			);
			const solde = soldeAEcrire(j, e.compteId, releve);
			// Rien à écrire : ni Journal, ni fichier, ni trace d'import.
			if (!e.reglage && plan.nouvelles.length === 0 && solde.ecrire === null) {
				return succes(recapitulatif(plan, releve, solde.ignore, null));
			}
			return executer(casImport, ctx, { ...e, format, releve, plan });
		},

		saisirLigne: (ctx: Ctx, e: EntreeLigne) => executer(casLigne, ctx, e),
		saisirSolde: (ctx: Ctx, e: EntreeSolde) => executer(casSolde, ctx, e),
		confirmerLigne: (ctx: Ctx, id: number) => executer(casConfirmer, ctx, id),
		retirerLigne: (ctx: Ctx, id: number) => executer(casRetirer, ctx, id),
		pointer: (ctx: Ctx, d: DemandePointage) => executer(casPointer, ctx, d),
		annuler: (ctx: Ctx, id: number) => executer(casAnnuler, ctx, id),
		ajuster: (ctx: Ctx, d: DemandePointage) => executer(casAjuster, ctx, d),

		creerDepuisLigne(
			ctx: Ctx,
			e: EntreeDepuisLigne
		): Resultat<{ id: number; pointageId: number | null }> {
			const deja = lire(ctx, 'saisir', () =>
				e.cle === undefined ? null : depots.journal.entiteDeCle(e.cle)
			);
			if (!deja.ok) return deja;
			if (deja.valeur !== null) return succes({ id: deja.valeur, pointageId: null });
			return executer(casDepuisLigne, ctx, e);
		},

		comptes(ctx: Ctx): Resultat<ComptePointable[]> {
			return lire(ctx, 'saisir', () => comptesPointables(journal()));
		},

		/** Compteur de `barre-laterale`. */
		aPointer(ctx: Ctx): Resultat<number> {
			return lire(ctx, 'saisir', () => lignesAPointer(journal()));
		},

		page(ctx: Ctx, compteId: number, depuis: DateCivile | null): Resultat<PagePointage> {
			const r = lire(ctx, 'saisir', () => {
				const j = journal();
				const compte = compteDe(j, compteId);
				if (compte === undefined) return null;
				return {
					...vuePointage(j, compteId, {
						aujourdhui: ctx.aujourdhui,
						depuis,
						periodes: depots.pointage.periodes(compteId)
					}),
					compte,
					comptes: comptesPointables(j)
				};
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Une Opération non proposée se relie par recherche : seuls les Côtés non pointés sortent. */
		candidats(ctx: Ctx, compteId: number, texte: string): Resultat<CandidatPointage[]> {
			return lire(ctx, 'saisir', () => {
				const j = journal();
				const net = texte.trim();
				const trouves =
					net === ''
						? null
						: new Set(
								rechercher({ ...j, operationsAnnulees: [] }, { texte: net }).map(
									(t) => t.operation.id
								)
							);
				return cotesOuverts(j, compteId)
					.filter((o) => trouves === null || trouves.has(o.operation.id))
					.sort((a, b) => b.cote.date.localeCompare(a.cote.date) || b.cote.id - a.cote.id)
					.slice(0, 8)
					.map(({ cote, operation }) => ({
						coteId: cote.id,
						operationId: operation.id,
						libelle: libelleDuCote(j, operation, cote),
						date: cote.date,
						montant: cote.montant
					}));
			});
		},

		/** Ce que le panneau reprend d'une Ligne de relevé (FR-14). */
		ligneASaisir(ctx: Ctx, id: number): Resultat<LigneASaisir> {
			const r = lire(ctx, 'saisir', () => {
				const j = journal();
				const ligne = j.lignesReleve.find((l) => l.id === id);
				if (ligne === undefined) return null;
				const retenue = dateDepuisLigne(j.exercices, ligne.date);
				if (!retenue.ok) return retenue;
				return succes(ligneASaisir(j, ligne, retenue.valeur));
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : r.valeur;
		}
	};
}

export type ModulePointage = ReturnType<typeof creerPointage>;
