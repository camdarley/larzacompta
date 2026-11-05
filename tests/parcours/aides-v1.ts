/**
 * Instance de recette de la v1 : l'Exercice fictif complet, plus ce que seuls le jalon 2 et le
 * jalon 3 produisent (Session ouverte, Budget, Factures). Aucun nom, IBAN ni n° de chèque réel.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { centimes as c } from '../../src/lib/domaine/montant.ts';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { chargerDansDossier } from '../jeux/charger.ts';

export const JETONS_V1 = {
	tresorier: 'session-fictive-v1-tresorerie',
	lecteur: 'session-fictive-v1-lecture',
	compteur: 'session-fictive-v1-comptage'
};
export type RoleV1 = keyof typeof JETONS_V1;

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(`Instance de recette : ${r.erreur.code}`);
	return r.valeur;
}

export async function preparerInstanceV1(d: string) {
	const j = chargerDansDossier(d);
	const base = ouvrirBase(join(d, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(d, 'fichiers')) });
	const depots = app.socle.depots;
	const maintenant = new Date().toISOString();
	const demain = new Date(Date.now() + 86_400_000).toISOString();
	const tresorier = depots.acces.lister().find((a) => a.role === 'tresorier')!;
	const lecteur = depots.acces.lister().find((a) => a.role === 'lecteur')!;
	const compteur = depots.acces.creer({
		identifiant: 'sam',
		nomAffiche: 'Sam Fictif',
		role: 'compteur',
		hash: 'sans-mot-de-passe',
		creeLe: maintenant
	});
	depots.acces.definirCaisses(compteur, [j.caisse]);
	for (const [role, accesId] of [
		['tresorier', tresorier.id],
		['lecteur', lecteur.id],
		['compteur', compteur]
	] as const) {
		depots.acces.creerSession({
			hashJeton: createHash('sha256').update(JETONS_V1[role]).digest('hex'),
			accesId,
			creeLe: maintenant,
			derniereActiviteLe: maintenant,
			expireLe: demain
		});
	}
	const ctx = app.ctx(depots.acces.parId(tresorier.id));

	const compte = app.caisses.compterCaisse(ctx, {
		compteId: j.caisse,
		actionId: j.kermesse,
		date: ctx.aujourdhui,
		confirmation: c(90_00),
		coupures: [
			{ coupure: c(2000), quantite: 4 },
			{ coupure: c(1000), quantite: 1 }
		]
	});
	const session = exiger(compte).sessionId;
	if (session === null) throw new Error('Instance de recette : Session');

	const exercice = depots.exercices.lister().find((e) => e.statut === 'ouvert')!;
	const natures = depots.parametrage.natures();
	const nature = (libelle: string) => natures.find((n) => n.libelle === libelle)!.id;
	for (const [natureId, sens, montant] of [
		[nature('Buvette'), 'recette', 600_00],
		[nature('Fournitures'), 'depense', 150_00]
	] as const) {
		exiger(
			app.budget.enregistrer(ctx, {
				exerciceId: exercice.id,
				actionId: j.kermesse,
				natureId,
				sens,
				montant: c(montant)
			})
		);
	}

	const saisie = {
		tiersNom: 'Cantine fictive',
		tiersAdresse: '1 rue Fictive',
		dateEmission: ctx.aujourdhui,
		actionId: j.kermesse,
		lignes: [{ designation: 'Repas fictifs', quantite: 20, prixUnitaire: c(5_00) }]
	};
	const validee = exiger(app.factures.creer(ctx, saisie)).id;
	exiger(await app.factures.valider(ctx, validee));
	const annulee = exiger(app.factures.creer(ctx, { ...saisie, tiersNom: 'Traiteur fictif' })).id;
	exiger(await app.factures.valider(ctx, annulee));
	exiger(await app.factures.creerAvoir(ctx, annulee));
	const brouillon = exiger(app.factures.creer(ctx, { ...saisie, tiersNom: 'Mairie fictive' })).id;

	const remise = depots.operations.journal().remises[0]!.id;
	const fin = exercice.fin;
	base.close();
	return { ...j, session, remise, validee, annulee, brouillon, exerciceId: exercice.id, fin };
}

export type InstanceV1 = Awaited<ReturnType<typeof preparerInstanceV1>>;

export type EcranV1 = { nom: string; url: string; role: RoleV1 };

const tresorier = (nom: string, url: string): EcranV1 => ({ nom, url, role: 'tresorier' });
const lecteur = (nom: string, url: string): EcranV1 => ({ nom, url, role: 'lecteur' });

/** Ce qu'un·e lecteur·rice atteint. Chaque écran se vérifie sans bouton d'action. */
export const ecransLecteur = (v: InstanceV1): EcranV1[] => [
	lecteur('lecture-tableau', '/'),
	lecteur('lecture-operations', '/operations'),
	lecteur('lecture-recherche', '/operations?q=kermesse'),
	lecteur('lecture-operation', '/operations?op=4'),
	lecteur('lecture-caisses', '/caisses'),
	lecteur('lecture-detail-caisse', `/caisses/${v.caisse}`),
	lecteur('lecture-session', `/sessions/${v.session}`),
	lecteur('lecture-cheques', '/cheques?etat=tous'),
	lecteur('lecture-remises', '/cheques/remises'),
	lecteur('lecture-remise', `/cheques/remises/${v.remise}`),
	lecteur('lecture-emis', '/cheques/emis'),
	lecteur('lecture-creances', '/creances-dettes'),
	lecteur('lecture-pieces', '/pieces'),
	lecteur('lecture-pieces-toutes', '/pieces/toutes'),
	lecteur('lecture-piece', '/pieces/toutes?piece=1'),
	lecteur('lecture-actions', '/actions'),
	lecteur('lecture-action', `/actions/${v.kermesse}`),
	lecteur('lecture-etats', '/etats'),
	lecteur('lecture-tresorerie', '/etats/tresorerie'),
	lecteur('lecture-document-ag', '/etats/document-ag'),
	lecteur('lecture-journal', '/journal'),
	lecteur('lecture-aide', '/aide'),
	lecteur('lecture-plus', '/plus')
];

/** Tous les écrans des trois jalons. `tests/projet` vérifie qu'aucune page n'y manque. */
export const ecransV1 = (v: InstanceV1): EcranV1[] => [
	...ecransLecteur(v),
	lecteur('lecture-preferences', '/preferences'),
	lecteur('lecture-refus', '/pointage'),
	tresorier('tableau', '/'),
	tresorier('operations', '/operations'),
	tresorier('operation-nouvelle', '/operations?op=nouvelle'),
	tresorier('pointage', '/pointage'),
	tresorier('pointage-compte', `/pointage/${v.banque}`),
	tresorier('caisses', '/caisses'),
	tresorier('detail-caisse', `/caisses/${v.caisse}`),
	tresorier('session', `/sessions/${v.session}`),
	tresorier('cheques', '/cheques'),
	tresorier('emis', '/cheques/emis'),
	tresorier('remises', '/cheques/remises'),
	tresorier('nouvelle-remise', '/cheques/remises/nouvelle'),
	tresorier('remise', `/cheques/remises/${v.remise}`),
	tresorier('creances', '/creances-dettes'),
	tresorier('pieces', '/pieces'),
	tresorier('pieces-toutes', '/pieces/toutes'),
	tresorier('pieces-photo', '/pieces/photo'),
	tresorier('factures', '/factures'),
	tresorier('facture-nouvelle', '/factures/nouvelle'),
	tresorier('facture-brouillon', `/factures/${v.brouillon}`),
	tresorier('facture-validee', `/factures/${v.validee}`),
	tresorier('facture-avoir', `/factures/${v.validee}/avoir`),
	tresorier('actions', '/actions'),
	tresorier('action', `/actions/${v.kermesse}`),
	tresorier('etats', '/etats'),
	tresorier('tresorerie', '/etats/tresorerie'),
	tresorier('document-ag', '/etats/document-ag'),
	tresorier('budget', '/budget'),
	tresorier('budget-deplie', '/budget?ouvert=tout'),
	tresorier('journal', '/journal'),
	tresorier('aide', '/aide'),
	tresorier('plus', '/plus'),
	tresorier('preferences', '/preferences'),
	tresorier('reglages', '/reglages'),
	tresorier('reglages-comptes', '/reglages/comptes'),
	tresorier('reglages-natures', '/reglages/natures'),
	tresorier('reglages-actions', '/reglages/actions'),
	tresorier('reglages-groupes', '/reglages/groupes'),
	tresorier('reglages-acces', '/reglages/acces'),
	tresorier('reglages-exercices', '/reglages/exercices'),
	tresorier('cloture', `/reglages/exercices/${v.exerciceId}/cloture`),
	tresorier('sauvegardes', '/reglages/sauvegardes'),
	tresorier('restauration', '/reglages/sauvegardes/restauration'),
	tresorier('a-propos', '/reglages/a-propos'),
	tresorier('bienvenue', '/bienvenue'),
	{ nom: 'mes-caisses', url: '/mes-caisses', role: 'compteur' },
	{ nom: 'comptage-session', url: `/sessions/${v.session}/comptage`, role: 'compteur' },
	{ nom: 'comptage-caisse', url: `/caisses/${v.caisse}/comptage`, role: 'compteur' }
];
