/**
 * Chemin d'écriture unique (AD-7) : droit, transaction, décision, écriture, Journal, validation.
 * Le Journal s'écrit dans la transaction ou pas du tout.
 */
import type { AccesConnecte } from '#lib/domaine/acces.ts';
import { instantVersDate, type DateCivile, type Instant } from '#lib/domaine/dates.ts';
import { peut, type Droit } from '#lib/domaine/droits.ts';
import { echec, type Resultat } from '#lib/domaine/resultat.ts';
import type {
	Archiveur,
	CodeSource,
	Depots,
	Exporteurs,
	Fichiers,
	Hacheur,
	Horloge,
	Jetons,
	Journaliseur,
	Sources,
	SourceVersions,
	Transaction
} from './ports.ts';

export type Ctx = {
	acces: AccesConnecte | null;
	maintenant: Instant;
	aujourdhui: DateCivile;
};

export type Socle = {
	depots: Depots;
	transaction: Transaction;
	horloge: Horloge;
	hacheur: Hacheur;
	jetons: Jetons;
	journaliseur: Journaliseur;
	exporteurs: Exporteurs;
	sources: Sources;
	fichiers: Fichiers;
	archiveur: Archiveur;
	versions: SourceVersions;
	versionActuelle: string;
	revision: string | null;
	codeSource: CodeSource;
};

export type NoteJournal = {
	evenement: `${string}.${string}`;
	entiteType: string;
	entiteId?: number | null;
	resume: string;
	avant?: unknown;
	apres?: unknown;
};

export type Outils = {
	ctx: Ctx;
	depots: Depots;
	noter(note: NoteJournal): void;
};

export type CasUsage<E, S> = {
	/** `public` : connexion et lien d'invitation, sans session par nature. */
	droit: Droit | 'public';
	/** Session et tentatives de connexion : technique, sans intérêt au Journal. */
	sansJournal?: boolean;
	/** Nom affiché au Journal quand aucun Accès n'agit. */
	auteur?: string;
	faire(outils: Outils, entree: E): Resultat<S>;
};

export function contexte(horloge: Horloge, acces: AccesConnecte | null): Ctx {
	const maintenant = horloge.maintenant();
	return { acces, maintenant, aujourdhui: instantVersDate(maintenant) };
}

function autorise(droit: Droit | 'public', ctx: Ctx) {
	if (droit === 'public') return true;
	return ctx.acces !== null && peut(ctx.acces.role, droit);
}

export function creerExecuteur(socle: Pick<Socle, 'depots' | 'transaction'>) {
	return function executer<E, S>(cas: CasUsage<E, S>, ctx: Ctx, entree: E): Resultat<S> {
		if (!autorise(cas.droit, ctx)) return echec('acces_refuse');

		return socle.transaction(() => {
			let notes = 0;
			const outils: Outils = {
				ctx,
				depots: socle.depots,
				noter(note) {
					notes += 1;
					socle.depots.journal.ajouter({
						horodatage: ctx.maintenant,
						accesId: ctx.acces?.id ?? null,
						accesNom: ctx.acces?.nomAffiche ?? cas.auteur ?? 'Serveur',
						evenement: note.evenement,
						entiteType: note.entiteType,
						entiteId: note.entiteId ?? null,
						resume: note.resume,
						avantJson: note.avant === undefined ? null : JSON.stringify(note.avant),
						apresJson: note.apres === undefined ? null : JSON.stringify(note.apres)
					});
				}
			};
			const resultat = cas.faire(outils, entree);
			if (resultat.ok && notes === 0 && !cas.sansJournal) {
				throw new Error('Une écriture ne passe pas sans entrée au Journal (AD-7).');
			}
			return resultat;
		});
	};
}

export type Executer = ReturnType<typeof creerExecuteur>;

/** Toute lecture déclare aussi son droit (AD-15). */
export function creerLecteur() {
	return function lire<S>(ctx: Ctx, droit: Droit, f: () => S): Resultat<S> {
		if (!autorise(droit, ctx)) return echec('acces_refuse');
		return { ok: true, valeur: f() };
	};
}

export type Lire = ReturnType<typeof creerLecteur>;
