import {
	activiteAEcrire,
	apresEchec,
	expirationLien,
	expirationSession,
	revocationPermise,
	sessionExpiree,
	identifiantReserve,
	tentativeAutorisee,
	verifierMotDePasse,
	IDENTIFIANT_RESERVE,
	type AccesConnecte,
	type Preferences
} from '#lib/domaine/acces.ts';
import type { Instant } from '#lib/domaine/dates.ts';
import type { Role } from '#lib/domaine/droits.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import type { LigneAcces } from '../ports.ts';

/** Accès d'attente du lien initial : le schéma exige un Accès derrière tout jeton. */
const IDENTIFIANT_INITIAL = IDENTIFIANT_RESERVE;

export type TypeInvitation = 'initial' | 'creation' | 'reinitialisation';

export type Invitation = { type: TypeInvitation; identifiant: string; nomAffiche: string };

export type SessionOuverte = {
	jeton: string;
	expireLe: Instant;
	acces: AccesConnecte;
};

export type SessionLue = { acces: AccesConnecte; prolongeeJusquAu: Instant | null };

export type LigneAccesVue = {
	id: number;
	identifiant: string;
	nomAffiche: string;
	role: Role;
	enAttente: boolean;
	/** Caisses autorisées d'un·e compteur·se. */
	caisses: number[];
	dernierAccesLe: Instant | null;
	revoqueLe: Instant | null;
};

function versConnecte(l: LigneAcces): AccesConnecte {
	return {
		id: l.id,
		identifiant: l.identifiant,
		nomAffiche: l.nomAffiche,
		role: l.role,
		preferences: l.preferences
	};
}

export function creerAcces(socle: Socle, executer: Executer, lire: Lire) {
	const { depots, jetons, hacheur } = socle;
	/** Vérifié quand l'identifiant n'existe pas, pour ne pas le trahir par le temps de réponse. */
	let leurre: string | null = null;

	function ouvrirSession(o: Outils, accesId: number): { jeton: string; expireLe: Instant } {
		const jeton = jetons.generer();
		const creeLe = o.ctx.maintenant;
		const expireLe = expirationSession(creeLe, creeLe);
		o.depots.acces.creerSession({
			hashJeton: jetons.empreinte(jeton),
			accesId,
			creeLe,
			derniereActiviteLe: creeLe,
			expireLe
		});
		o.depots.acces.noterAcces(accesId, creeLe);
		return { jeton, expireLe };
	}

	function emettreJeton(o: Outils, accesId: number): string {
		o.depots.acces.supprimerJetons(accesId);
		const jeton = jetons.generer();
		o.depots.acces.creerJeton({
			hashJeton: jetons.empreinte(jeton),
			accesId,
			expireLe: expirationLien(o.ctx.maintenant)
		});
		return jeton;
	}

	function jetonValide(hashJeton: string, maintenant: Instant) {
		const j = depots.acces.lireJeton(hashJeton);
		if (j === null || j.utiliseLe !== null || sessionExpiree(j.expireLe, maintenant)) return null;
		const a = depots.acces.parId(j.accesId);
		return a === null || a.revoqueLe !== null ? null : a;
	}

	function typeInvitation(a: LigneAcces): TypeInvitation {
		if (a.identifiant === IDENTIFIANT_INITIAL) return 'initial';
		return a.aMotDePasse ? 'reinitialisation' : 'creation';
	}

	const casLienInitial: CasUsage<void, string | null> = {
		droit: 'public',
		auteur: 'Serveur',
		faire(o) {
			const existant = o.depots.acces.parIdentifiant(IDENTIFIANT_INITIAL);
			const tresorierActif = o.depots.acces.tresoriersActifs().length > 0;
			if (tresorierActif) {
				o.noter({
					evenement: 'acces.lien_initial_refuse',
					entiteType: 'acces',
					resume: 'a refusé un lien initial : un Accès existe déjà.'
				});
				return succes(null);
			}
			const id =
				existant?.id ??
				o.depots.acces.creer({
					identifiant: IDENTIFIANT_INITIAL,
					nomAffiche: 'Lien initial',
					role: 'tresorier',
					creeLe: o.ctx.maintenant
				});
			o.noter({
				evenement: 'acces.lien_initial_emis',
				entiteType: 'acces',
				entiteId: id,
				resume: 'a émis le lien initial.'
			});
			return succes(emettreJeton(o, id));
		}
	};

	const casInvitation: CasUsage<
		{ jeton: string; identifiant?: string; nomAffiche?: string; hash: string },
		SessionOuverte & { type: TypeInvitation }
	> = {
		droit: 'public',
		faire(o, e) {
			const hashJeton = jetons.empreinte(e.jeton);
			const a = jetonValide(hashJeton, o.ctx.maintenant);
			if (a === null) return echec('lien_invalide');
			const type = typeInvitation(a);

			let identifiant = a.identifiant;
			let nomAffiche = a.nomAffiche;
			if (type === 'initial') {
				if (!e.identifiant || !e.nomAffiche) {
					const champs: Record<string, string> = {};
					if (!e.identifiant) champs.identifiant = 'champ_requis';
					if (!e.nomAffiche) champs.nomAffiche = 'champ_requis';
					return echec('saisie_invalide', { champs });
				}
				identifiant = e.identifiant;
				nomAffiche = e.nomAffiche;
				if (identifiantReserve(identifiant)) {
					return echec('saisie_invalide', { champs: { identifiant: 'identifiant_reserve' } });
				}
				o.depots.acces.definirIdentite(a.id, identifiant, nomAffiche);
			}
			o.depots.acces.definirMotDePasse(a.id, e.hash);
			o.depots.acces.utiliserJeton(hashJeton, o.ctx.maintenant);
			// Une session volée ne survit pas à la procédure de récupération.
			o.depots.acces.supprimerSessions(a.id);

			const session = ouvrirSession(o, a.id);
			const acces: AccesConnecte = { ...versConnecte(a), identifiant, nomAffiche };
			o.noter({
				evenement: type === 'reinitialisation' ? 'acces.reinitialise' : 'acces.active',
				entiteType: 'acces',
				entiteId: a.id,
				resume:
					type === 'reinitialisation'
						? `a réinitialisé le mot de passe de ${nomAffiche}.`
						: `a activé l’Accès de ${nomAffiche}.`
			});
			return succes({ ...session, acces, type });
		}
	};

	type TentativeConnexion = { identifiant: string; adresse: string; bonMotDePasse: boolean };

	const clesTentative = (e: { identifiant: string; adresse: string }) => [
		`id:${e.identifiant.toLowerCase()}`,
		`ip:${e.adresse}`
	];

	const bloquee = (e: { identifiant: string; adresse: string }, maintenant: Instant) =>
		clesTentative(e).some((c) => !tentativeAutorisee(depots.acces.lireTentative(c), maintenant));

	const casConnexion: CasUsage<
		TentativeConnexion,
		{ session: SessionOuverte } | { refus: 'connexion_refusee' | 'trop_de_tentatives' }
	> = {
		droit: 'public',
		sansJournal: true,
		faire(o, e) {
			const cles = clesTentative(e);
			if (bloquee(e, o.ctx.maintenant)) return succes({ refus: 'trop_de_tentatives' as const });

			const a = o.depots.acces.parIdentifiant(e.identifiant);
			const utilisable = a !== null && a.revoqueLe === null && a.aMotDePasse;
			if (!utilisable || !e.bonMotDePasse) {
				for (const c of cles) {
					o.depots.acces.ecrireTentative(
						apresEchec(o.depots.acces.lireTentative(c), c, o.ctx.maintenant)
					);
				}
				return succes({ refus: 'connexion_refusee' as const });
			}
			for (const c of cles) o.depots.acces.effacerTentative(c);
			return succes({ session: { ...ouvrirSession(o, a.id), acces: versConnecte(a) } });
		}
	};

	const casSession: CasUsage<string, SessionLue | null> = {
		droit: 'public',
		sansJournal: true,
		faire(o, jeton) {
			const hash = jetons.empreinte(jeton);
			const s = o.depots.acces.lireSession(hash);
			if (s === null) return succes(null);
			if (sessionExpiree(s.expireLe, o.ctx.maintenant)) {
				o.depots.acces.supprimerSession(hash);
				return succes(null);
			}
			const a = o.depots.acces.parId(s.accesId);
			if (a === null || a.revoqueLe !== null) return succes(null);
			if (!activiteAEcrire(s.derniereActiviteLe, o.ctx.maintenant)) {
				return succes({ acces: versConnecte(a), prolongeeJusquAu: null });
			}
			const prolongeeJusquAu = expirationSession(s.creeLe, o.ctx.maintenant);
			o.depots.acces.toucherSession(hash, o.ctx.maintenant, prolongeeJusquAu);
			o.depots.acces.noterAcces(a.id, o.ctx.maintenant);
			return succes({ acces: versConnecte(a), prolongeeJusquAu });
		}
	};

	const casDeconnexion: CasUsage<string, true> = {
		droit: 'public',
		sansJournal: true,
		faire(o, jeton) {
			o.depots.acces.supprimerSession(jetons.empreinte(jeton));
			return succes(true);
		}
	};

	/** Seules des caisses s'autorisent : un Compte banque n'a rien à compter (A3). */
	function ecrireCaisses(o: Outils, id: number, caisses: readonly number[]): Resultat<true> {
		const connues = o.depots.parametrage.comptes().filter((c) => c.type === 'caisse');
		if (!caisses.every((c) => connues.some((x) => x.id === c))) {
			return echec('element_introuvable');
		}
		o.depots.acces.definirCaisses(id, caisses);
		return succes(true);
	}

	const casCreation: CasUsage<
		{ identifiant: string; nomAffiche: string; role: Role; caisses?: readonly number[] },
		{ id: number; jeton: string }
	> = {
		droit: 'parametrer',
		faire(o, e) {
			if (identifiantReserve(e.identifiant)) {
				return echec('identifiant_reserve', { champ: 'identifiant' });
			}
			if (o.depots.acces.parIdentifiant(e.identifiant) !== null) {
				return echec('identifiant_deja_utilise', { champ: 'identifiant' });
			}
			const { caisses = [], ...acces } = e;
			const id = o.depots.acces.creer({ ...acces, creeLe: o.ctx.maintenant });
			const autorisees = ecrireCaisses(o, id, e.role === 'compteur' ? caisses : []);
			if (!autorisees.ok) return autorisees;
			const jeton = emettreJeton(o, id);
			o.noter({
				evenement: 'acces.cree',
				entiteType: 'acces',
				entiteId: id,
				resume: `a créé l’Accès de ${e.nomAffiche}.`,
				apres: { identifiant: e.identifiant, nomAffiche: e.nomAffiche, role: e.role, caisses }
			});
			return succes({ id, jeton });
		}
	};

	const casCaisses: CasUsage<{ id: number; caisses: readonly number[] }, true> = {
		droit: 'parametrer',
		faire(o, e) {
			const a = o.depots.acces.parId(e.id);
			if (a === null || a.role !== 'compteur') return echec('element_introuvable');
			const avant = o.depots.acces.caissesDe(e.id);
			const autorisees = ecrireCaisses(o, e.id, e.caisses);
			if (!autorisees.ok) return autorisees;
			o.noter({
				evenement: 'acces.caisses_modifiees',
				entiteType: 'acces',
				entiteId: e.id,
				resume: `a changé les caisses autorisées de ${a.nomAffiche}.`,
				avant,
				apres: e.caisses
			});
			return succes(true);
		}
	};

	const casRevocation: CasUsage<number, true> = {
		droit: 'parametrer',
		faire(o, id) {
			const a = o.depots.acces.parId(id);
			if (a === null || a.identifiant === IDENTIFIANT_INITIAL) return echec('element_introuvable');
			if (a.revoqueLe !== null) return succes(true);
			const permise = revocationPermise(a, o.depots.acces.tresoriersActifs());
			if (!permise.ok) return permise;
			o.depots.acces.revoquer(id, o.ctx.maintenant);
			o.depots.acces.supprimerSessions(id);
			o.depots.acces.supprimerJetons(id);
			o.noter({
				evenement: 'acces.revoque',
				entiteType: 'acces',
				entiteId: id,
				resume: `a révoqué l’Accès de ${a.nomAffiche}.`
			});
			return succes(true);
		}
	};

	const casReinitialisation: CasUsage<string, string> = {
		droit: 'public',
		auteur: 'Serveur',
		faire(o, identifiant) {
			const a = o.depots.acces.parIdentifiant(identifiant);
			if (a === null || a.identifiant === IDENTIFIANT_INITIAL) return echec('element_introuvable');
			const jeton = emettreJeton(o, a.id);
			// La personne qui reprend la main ne reste pas bloquée par des essais d'autrui.
			o.depots.acces.effacerTentative(`id:${a.identifiant.toLowerCase()}`);
			o.noter({
				evenement: 'acces.lien_reinitialisation_emis',
				entiteType: 'acces',
				entiteId: a.id,
				resume: `a émis un lien de réinitialisation pour ${a.nomAffiche}.`
			});
			return succes(jeton);
		}
	};

	/** Même compteur que la connexion : une session volée ne teste pas de mot de passe en série. */
	const casEchecMotDePasse: CasUsage<{ identifiant: string; adresse: string }, true> = {
		droit: 'etre_connecte',
		sansJournal: true,
		faire(o, e) {
			for (const c of clesTentative(e)) {
				o.depots.acces.ecrireTentative(
					apresEchec(o.depots.acces.lireTentative(c), c, o.ctx.maintenant)
				);
			}
			return succes(true);
		}
	};

	const casMotDePasse: CasUsage<
		{ hash: string; cles: string[] },
		{ jeton: string; expireLe: Instant }
	> = {
		droit: 'etre_connecte',
		faire(o, e) {
			const id = (o.ctx.acces as AccesConnecte).id;
			for (const c of e.cles) o.depots.acces.effacerTentative(c);
			o.depots.acces.definirMotDePasse(id, e.hash);
			// Toutes les sessions tombent, celle-ci renaît : le navigateur reçoit un nouveau jeton.
			o.depots.acces.supprimerSessions(id);
			const session = ouvrirSession(o, id);
			o.noter({
				evenement: 'acces.mot_de_passe_change',
				entiteType: 'acces',
				entiteId: id,
				resume: 'a changé son mot de passe.'
			});
			return succes(session);
		}
	};

	const casPreferences: CasUsage<Preferences, Preferences> = {
		droit: 'etre_connecte',
		sansJournal: true,
		faire(o, preferences) {
			o.depots.acces.definirPreferences((o.ctx.acces as AccesConnecte).id, preferences);
			return succes(preferences);
		}
	};

	return {
		/** Lien initial si l'instance n'a encore aucun Accès utilisable. */
		emettreLienInitial(ctx: Ctx): Resultat<string | null> {
			return executer(casLienInitial, ctx, undefined);
		},

		instanceSansAcces(): boolean {
			return depots.acces.tresoriersActifs().length === 0;
		},

		lireInvitation(ctx: Ctx, jeton: string): Resultat<Invitation> {
			const a = jetonValide(jetons.empreinte(jeton), ctx.maintenant);
			if (a === null) return echec('lien_invalide');
			const type = typeInvitation(a);
			return succes({
				type,
				identifiant: type === 'initial' ? '' : a.identifiant,
				nomAffiche: type === 'initial' ? '' : a.nomAffiche
			});
		},

		async accepterInvitation(
			ctx: Ctx,
			e: { jeton: string; identifiant?: string; nomAffiche?: string; motDePasse: string }
		) {
			const mdp = verifierMotDePasse(e.motDePasse);
			if (!mdp.ok) return mdp;
			// Un jeton faux ne coûte aucun calcul.
			if (jetonValide(jetons.empreinte(e.jeton), ctx.maintenant) === null) {
				return echec('lien_invalide');
			}
			// Le hachage reste hors de la transaction : il prend plusieurs dizaines de millisecondes.
			const hash = await hacheur.hacher(mdp.valeur);
			return executer(casInvitation, ctx, { ...e, hash });
		},

		async connecter(
			ctx: Ctx,
			e: { identifiant: string; motDePasse: string; adresse: string }
		): Promise<Resultat<SessionOuverte>> {
			// Le blocage se lit d'abord : un essai refusé ne doit rien coûter au serveur.
			if (bloquee(e, ctx.maintenant)) return echec('trop_de_tentatives');
			const a = depots.acces.parIdentifiant(e.identifiant);
			leurre ??= await hacheur.hacher('leurre-sans-valeur');
			const bonMotDePasse = await hacheur.verifier(e.motDePasse, a?.hash ?? leurre);
			const r = executer(casConnexion, ctx, {
				identifiant: e.identifiant,
				adresse: e.adresse,
				bonMotDePasse: a !== null && bonMotDePasse
			});
			if (!r.ok) return r;
			return 'refus' in r.valeur ? echec(r.valeur.refus) : succes(r.valeur.session);
		},

		accesDepuisSession(ctx: Ctx, jeton: string): AccesConnecte | null {
			const r = executer(casSession, ctx, jeton);
			return r.ok ? (r.valeur?.acces ?? null) : null;
		},

		/** Une session prolongée en base doit l'être aussi dans le cookie du navigateur (AD-14). */
		lireSession(ctx: Ctx, jeton: string): SessionLue | null {
			const r = executer(casSession, ctx, jeton);
			return r.ok ? r.valeur : null;
		},

		deconnecter(ctx: Ctx, jeton: string) {
			return executer(casDeconnexion, ctx, jeton);
		},

		creer(
			ctx: Ctx,
			e: { identifiant: string; nomAffiche: string; role: Role; caisses?: readonly number[] }
		) {
			return executer(casCreation, ctx, e);
		},

		definirCaisses(ctx: Ctx, e: { id: number; caisses: readonly number[] }) {
			return executer(casCaisses, ctx, e);
		},

		revoquer(ctx: Ctx, id: number) {
			return executer(casRevocation, ctx, id);
		},

		reinitialiser(ctx: Ctx, identifiant: string) {
			return executer(casReinitialisation, ctx, identifiant);
		},

		async changerMotDePasse(
			ctx: Ctx,
			e: { actuel: string; nouveau: string; adresse?: string }
		): Promise<Resultat<{ jeton: string; expireLe: Instant }>> {
			const mdp = verifierMotDePasse(e.nouveau);
			if (!mdp.ok) return echec('mot_de_passe_court', { champ: 'nouveau' });
			const a = ctx.acces ? depots.acces.parId(ctx.acces.id) : null;
			if (a === null) return echec('acces_refuse');
			const tentative = { identifiant: a.identifiant, adresse: e.adresse ?? 'inconnue' };
			if (bloquee(tentative, ctx.maintenant)) return echec('trop_de_tentatives');
			const bonActuel = a.hash ? await hacheur.verifier(e.actuel, a.hash) : false;
			if (!bonActuel) {
				const note = executer(casEchecMotDePasse, ctx, tentative);
				return note.ok ? echec('mot_de_passe_faux', { champ: 'actuel' }) : note;
			}
			const hash = await hacheur.hacher(mdp.valeur);
			return executer(casMotDePasse, ctx, { hash, cles: clesTentative(tentative) });
		},

		changerPreferences(ctx: Ctx, preferences: Preferences) {
			return executer(casPreferences, ctx, preferences);
		},

		lister(ctx: Ctx): Resultat<LigneAccesVue[]> {
			return lire(ctx, 'parametrer', () =>
				depots.acces
					.lister()
					.filter((a) => a.identifiant !== IDENTIFIANT_INITIAL)
					.map((a) => ({
						id: a.id,
						identifiant: a.identifiant,
						nomAffiche: a.nomAffiche,
						role: a.role,
						enAttente: !a.aMotDePasse,
						caisses: depots.acces.caissesDe(a.id),
						dernierAccesLe: a.dernierAccesLe,
						revoqueLe: a.revoqueLe
					}))
			);
		}
	};
}

export type ModuleAcces = ReturnType<typeof creerAcces>;
