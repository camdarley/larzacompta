import { lirePreferences } from '#lib/domaine/acces.ts';
import type { Role } from '#lib/domaine/droits.ts';
import type { DepotAcces, LigneAcces, SessionConnexion } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type LigneBrute = {
	id: number;
	identifiant: string;
	nom_affiche: string;
	role: Role;
	hash_mot_de_passe: string | null;
	preferences_json: string;
	cree_le: string;
	dernier_acces_le: string | null;
	revoque_le: string | null;
};

type SessionBrute = {
	hash_jeton: string;
	acces_id: number;
	cree_le: string;
	derniere_activite_le: string;
	expire_le: string;
};

function versAcces(l: LigneBrute): LigneAcces {
	return {
		id: l.id,
		identifiant: l.identifiant,
		nomAffiche: l.nom_affiche,
		role: l.role,
		preferences: lirePreferences(l.preferences_json),
		aMotDePasse: l.hash_mot_de_passe !== null,
		hash: l.hash_mot_de_passe,
		creeLe: l.cree_le,
		dernierAccesLe: l.dernier_acces_le,
		revoqueLe: l.revoque_le
	};
}

function versSession(s: SessionBrute): SessionConnexion {
	return {
		hashJeton: s.hash_jeton,
		accesId: s.acces_id,
		creeLe: s.cree_le,
		derniereActiviteLe: s.derniere_activite_le,
		expireLe: s.expire_le
	};
}

export function creerDepotAcces(base: Base): DepotAcces {
	const r = {
		compter: base.prepare('SELECT count(*) FROM acces').pluck(),
		parId: base.prepare('SELECT * FROM acces WHERE id = ?'),
		parIdentifiant: base.prepare('SELECT * FROM acces WHERE identifiant = ?'),
		lister: base.prepare('SELECT * FROM acces ORDER BY revoque_le IS NOT NULL, nom_affiche'),
		tresoriers: base.prepare(`
			SELECT id FROM acces
			WHERE role = 'tresorier' AND revoque_le IS NULL AND hash_mot_de_passe IS NOT NULL
		`),
		creer: base.prepare(`
			INSERT INTO acces (identifiant, nom_affiche, role, hash_mot_de_passe, cree_le)
			VALUES (@identifiant, @nomAffiche, @role, @hash, @creeLe)
		`),
		identite: base.prepare('UPDATE acces SET identifiant = ?, nom_affiche = ? WHERE id = ?'),
		motDePasse: base.prepare('UPDATE acces SET hash_mot_de_passe = ? WHERE id = ?'),
		preferences: base.prepare('UPDATE acces SET preferences_json = ? WHERE id = ?'),
		noterAcces: base.prepare('UPDATE acces SET dernier_acces_le = ? WHERE id = ?'),
		revoquer: base.prepare('UPDATE acces SET revoque_le = ? WHERE id = ?'),

		creerJeton: base.prepare(
			'INSERT INTO jeton_acces (hash_jeton, acces_id, expire_le) VALUES (@hashJeton, @accesId, @expireLe)'
		),
		lireJeton: base.prepare('SELECT * FROM jeton_acces WHERE hash_jeton = ?'),
		utiliserJeton: base.prepare('UPDATE jeton_acces SET utilise_le = ? WHERE hash_jeton = ?'),
		supprimerJetons: base.prepare('DELETE FROM jeton_acces WHERE acces_id = ?'),

		creerSession: base.prepare(`
			INSERT INTO session_connexion (hash_jeton, acces_id, cree_le, derniere_activite_le, expire_le)
			VALUES (@hashJeton, @accesId, @creeLe, @derniereActiviteLe, @expireLe)
		`),
		lireSession: base.prepare('SELECT * FROM session_connexion WHERE hash_jeton = ?'),
		toucherSession: base.prepare(
			'UPDATE session_connexion SET derniere_activite_le = ?, expire_le = ? WHERE hash_jeton = ?'
		),
		supprimerSession: base.prepare('DELETE FROM session_connexion WHERE hash_jeton = ?'),
		supprimerSessions: base.prepare('DELETE FROM session_connexion WHERE acces_id = ?'),

		lireTentative: base.prepare('SELECT * FROM tentative_connexion WHERE cle = ?'),
		ecrireTentative: base.prepare(`
			INSERT INTO tentative_connexion (cle, echecs, premiere_le) VALUES (@cle, @echecs, @premiereLe)
			ON CONFLICT (cle) DO UPDATE SET echecs = excluded.echecs, premiere_le = excluded.premiere_le
		`),
		effacerTentative: base.prepare('DELETE FROM tentative_connexion WHERE cle = ?')
	};

	const ligne = (l: unknown) => (l === undefined ? null : versAcces(l as LigneBrute));

	return {
		compter: () => r.compter.get() as number,
		parId: (id) => ligne(r.parId.get(id)),
		parIdentifiant: (identifiant) => ligne(r.parIdentifiant.get(identifiant)),
		lister: () => (r.lister.all() as LigneBrute[]).map(versAcces),
		tresoriersActifs: () => r.tresoriers.all() as { id: number }[],
		creer: (a) => Number(r.creer.run({ ...a, hash: a.hash ?? null }).lastInsertRowid),
		definirIdentite: (id, identifiant, nomAffiche) =>
			void r.identite.run(identifiant, nomAffiche, id),
		definirMotDePasse: (id, hash) => void r.motDePasse.run(hash, id),
		definirPreferences: (id, p) => void r.preferences.run(JSON.stringify(p), id),
		noterAcces: (id, le) => void r.noterAcces.run(le, id),
		revoquer: (id, le) => void r.revoquer.run(le, id),

		creerJeton: (j) => void r.creerJeton.run(j),
		lireJeton(hash) {
			const j = r.lireJeton.get(hash) as
				| { hash_jeton: string; acces_id: number; expire_le: string; utilise_le: string | null }
				| undefined;
			return j
				? {
						hashJeton: j.hash_jeton,
						accesId: j.acces_id,
						expireLe: j.expire_le,
						utiliseLe: j.utilise_le
					}
				: null;
		},
		utiliserJeton: (hash, le) => void r.utiliserJeton.run(le, hash),
		supprimerJetons: (id) => void r.supprimerJetons.run(id),

		creerSession: (s) => void r.creerSession.run(s),
		lireSession(hash) {
			const s = r.lireSession.get(hash) as SessionBrute | undefined;
			return s ? versSession(s) : null;
		},
		toucherSession: (hash, activite, expireLe) =>
			void r.toucherSession.run(activite, expireLe, hash),
		supprimerSession: (hash) => void r.supprimerSession.run(hash),
		supprimerSessions: (id) => void r.supprimerSessions.run(id),

		lireTentative(cle) {
			const t = r.lireTentative.get(cle) as
				{ cle: string; echecs: number; premiere_le: string } | undefined;
			return t ? { cle: t.cle, echecs: t.echecs, premiereLe: t.premiere_le } : null;
		},
		ecrireTentative: (t) => void r.ecrireTentative.run(t),
		effacerTentative: (cle) => void r.effacerTentative.run(cle)
	};
}
