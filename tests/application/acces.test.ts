import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { creerHacheur } from '#lib/server/infra/auth/mot-de-passe.ts';
import { banc, type Banc } from './aides/app.ts';

let b: Banc;
const mdp = 'un mot de passe solide';

beforeEach(() => {
	b = banc();
});

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

function banqueVide() {
	b.base.exec(`UPDATE acces SET revoque_le = 'x'`);
}

describe('lien initial', () => {
	beforeEach(banqueVide);

	it("n'existe que sur une instance sans Accès utilisable", () => {
		expect(b.app.acces.instanceSansAcces()).toBe(true);
		const jeton = valeur(b.app.acces.emettreLienInitial(b.app.ctx(null)));
		expect(jeton).toBeTypeOf('string');
		valeur(
			b.app.acces.accepterInvitation(b.app.ctx(null), {
				jeton: jeton as string,
				identifiant: 'alex',
				nomAffiche: 'Alex',
				motDePasse: mdp
			})
		);
		expect(b.app.acces.instanceSansAcces()).toBe(false);
		expect(valeur(b.app.acces.emettreLienInitial(b.app.ctx(null)))).toBeNull();
	});

	it('crée un trésorier et devient inutilisable', () => {
		const jeton = valeur(b.app.acces.emettreLienInitial(b.app.ctx(null))) as string;
		expect(valeur(b.app.acces.lireInvitation(b.app.ctx(null), jeton)).type).toBe('initial');
		const r = valeur(
			b.app.acces.accepterInvitation(b.app.ctx(null), {
				jeton,
				identifiant: 'alex',
				nomAffiche: 'Alex',
				motDePasse: mdp
			})
		);
		expect(r.acces.role).toBe('tresorier');
		expect(r.acces.identifiant).toBe('alex');
		const second = b.app.acces.accepterInvitation(b.app.ctx(null), {
			jeton,
			identifiant: 'autre',
			nomAffiche: 'Autre',
			motDePasse: mdp
		});
		expect(second).toEqual({ ok: false, erreur: { code: 'lien_invalide' } });
	});

	it('réémettre invalide le lien précédent', () => {
		const ctx = b.app.ctx(null);
		const premier = valeur(b.app.acces.emettreLienInitial(ctx)) as string;
		const second = valeur(b.app.acces.emettreLienInitial(ctx)) as string;
		expect(b.app.acces.lireInvitation(ctx, premier).ok).toBe(false);
		expect(b.app.acces.lireInvitation(ctx, second).ok).toBe(true);
	});

	it('exige identifiant et nom, et 12 caractères', () => {
		const ctx = b.app.ctx(null);
		const jeton = valeur(b.app.acces.emettreLienInitial(ctx)) as string;
		const court = b.app.acces.accepterInvitation(ctx, { jeton, motDePasse: 'court' });
		expect(!court.ok && court.erreur.code).toBe('mot_de_passe_court');
		const sansNom = b.app.acces.accepterInvitation(ctx, { jeton, motDePasse: mdp });
		expect(!sansNom.ok && sansNom.erreur.code).toBe('saisie_invalide');
		expect(b.app.acces.lireInvitation(ctx, jeton).ok).toBe(true);
	});

	it('expire après 7 jours', () => {
		const jeton = valeur(b.app.acces.emettreLienInitial(b.app.ctx(null))) as string;
		b.horloge.instant = '2026-11-11T10:00:00.000Z';
		expect(b.app.acces.lireInvitation(b.app.ctx(null), jeton).ok).toBe(false);
	});

	it('ne stocke que le SHA-256 du jeton', () => {
		const jeton = valeur(b.app.acces.emettreLienInitial(b.app.ctx(null))) as string;
		const stockes = b.base.prepare('SELECT hash_jeton FROM jeton_acces').pluck().all();
		expect(stockes).toEqual([sha256(jeton)]);
	});
});

describe('connexion', () => {
	const entree = { identifiant: 'camille', motDePasse: 'mot-de-passe-long', adresse: '10.0.0.1' };

	it('ouvre une session dont seul le SHA-256 est stocké', () => {
		const s = valeur(b.app.acces.connecter(b.app.ctx(null), entree));
		expect(s.jeton.length).toBeGreaterThanOrEqual(43);
		expect(b.base.prepare('SELECT hash_jeton FROM session_connexion').pluck().get()).toBe(
			sha256(s.jeton)
		);
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)?.identifiant).toBe('camille');
	});

	it('refuse un mauvais mot de passe et un identifiant inconnu avec le même message', () => {
		const ctx = b.app.ctx(null);
		const a = b.app.acces.connecter(ctx, { ...entree, motDePasse: 'faux' });
		const c = b.app.acces.connecter(ctx, { ...entree, identifiant: 'inconnu' });
		expect(!a.ok && a.erreur.code).toBe('connexion_refusee');
		expect(!c.ok && c.erreur.code).toBe('connexion_refusee');
	});

	it('bloque après 10 échecs, même avec le bon mot de passe', () => {
		const ctx = b.app.ctx(null);
		for (let i = 0; i < 10; i++) b.app.acces.connecter(ctx, { ...entree, motDePasse: 'faux' });
		const r = b.app.acces.connecter(ctx, entree);
		expect(!r.ok && r.erreur.code).toBe('trop_de_tentatives');
		b.horloge.instant = '2026-11-04T10:15:00.000Z';
		expect(b.app.acces.connecter(b.app.ctx(null), entree).ok).toBe(true);
	});

	it('bloque aussi par adresse, quel que soit l identifiant', () => {
		const ctx = b.app.ctx(null);
		for (let i = 0; i < 10; i++) {
			b.app.acces.connecter(ctx, { ...entree, identifiant: `u${i}`, motDePasse: 'faux' });
		}
		const r = b.app.acces.connecter(ctx, entree);
		expect(!r.ok && r.erreur.code).toBe('trop_de_tentatives');
		expect(b.app.acces.connecter(ctx, { ...entree, adresse: '10.0.0.2' }).ok).toBe(true);
	});

	it('efface le compteur après une réussite', () => {
		const ctx = b.app.ctx(null);
		for (let i = 0; i < 9; i++) b.app.acces.connecter(ctx, { ...entree, motDePasse: 'faux' });
		expect(b.app.acces.connecter(ctx, entree).ok).toBe(true);
		for (let i = 0; i < 9; i++) b.app.acces.connecter(ctx, { ...entree, motDePasse: 'faux' });
		expect(b.app.acces.connecter(ctx, entree).ok).toBe(true);
	});

	it('expire après 7 jours d inactivité, et prolonge à chaque activité', () => {
		const s = valeur(b.app.acces.connecter(b.app.ctx(null), entree));
		b.horloge.instant = '2026-11-10T10:00:00.000Z';
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)).not.toBeNull();
		b.horloge.instant = '2026-11-16T10:00:00.000Z';
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)).not.toBeNull();
		b.horloge.instant = '2026-11-24T10:00:00.000Z';
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)).toBeNull();
		expect(b.base.prepare('SELECT count(*) FROM session_connexion').pluck().get()).toBe(0);
	});

	it('expire au plus tard après 30 jours', () => {
		const s = valeur(b.app.acces.connecter(b.app.ctx(null), entree));
		for (const jour of ['10', '16', '22', '28']) {
			b.horloge.instant = `2026-11-${jour}T10:00:00.000Z`;
			expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)).not.toBeNull();
		}
		b.horloge.instant = '2026-12-04T10:00:00.000Z';
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)).toBeNull();
	});

	it('la déconnexion supprime la session', () => {
		const s = valeur(b.app.acces.connecter(b.app.ctx(null), entree));
		b.app.acces.deconnecter(b.app.ctx(null), s.jeton);
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), s.jeton)).toBeNull();
	});
});

describe('création et révocation', () => {
	const alex = { identifiant: 'alex', nomAffiche: 'Alex', role: 'tresorier' as const };

	it('produit un lien à usage unique dont seul le SHA-256 est stocké', () => {
		const { jeton, id } = valeur(b.app.acces.creer(b.ctx(), alex));
		expect(
			b.base.prepare('SELECT hash_jeton FROM jeton_acces WHERE acces_id = ?').pluck().get(id)
		).toBe(sha256(jeton));
		expect(valeur(b.app.acces.lireInvitation(b.app.ctx(null), jeton)).type).toBe('creation');
		const r = valeur(b.app.acces.accepterInvitation(b.app.ctx(null), { jeton, motDePasse: mdp }));
		expect(r.acces.nomAffiche).toBe('Alex');
		expect(b.app.acces.lireInvitation(b.app.ctx(null), jeton).ok).toBe(false);
	});

	it('refuse un identifiant existant, à la casse près', () => {
		const r = b.app.acces.creer(b.ctx(), { ...alex, identifiant: 'CAMILLE' });
		expect(!r.ok && r.erreur.code).toBe('identifiant_deja_utilise');
	});

	it('A1 : refuse de révoquer le dernier Accès trésorier actif', () => {
		const r = b.app.acces.revoquer(b.ctx(), b.tresorier.id);
		expect(r).toEqual({ ok: false, erreur: { code: 'dernier_tresorier' } });
	});

	it('A1 : un Accès en attente de mot de passe ne compte pas comme actif', () => {
		valeur(b.app.acces.creer(b.ctx(), alex));
		const r = b.app.acces.revoquer(b.ctx(), b.tresorier.id);
		expect(!r.ok && r.erreur.code).toBe('dernier_tresorier');
	});

	it('A2 : un Accès révoqué perd sessions et jetons dans la même transaction', () => {
		const { jeton, id } = valeur(b.app.acces.creer(b.ctx(), alex));
		const session = valeur(
			b.app.acces.accepterInvitation(b.app.ctx(null), { jeton, motDePasse: mdp })
		);
		const lien = valeur(b.app.acces.reinitialiser(b.app.ctx(null), 'alex'));
		valeur(b.app.acces.revoquer(b.ctx(), id));
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), session.jeton)).toBeNull();
		expect(b.app.acces.lireInvitation(b.app.ctx(null), lien).ok).toBe(false);
		const r = b.app.acces.connecter(b.app.ctx(null), {
			identifiant: 'alex',
			motDePasse: mdp,
			adresse: '1'
		});
		expect(r.ok).toBe(false);
		expect(b.journal().at(-1)?.evenement).toBe('acces.revoque');
		expect(b.app.acces.lister(b.ctx()).ok).toBe(true);
	});

	it('réinitialise par lien, sans toucher à l identité', () => {
		const lien = valeur(b.app.acces.reinitialiser(b.app.ctx(null), 'camille'));
		const ctx = b.app.ctx(null);
		expect(valeur(b.app.acces.lireInvitation(ctx, lien)).type).toBe('reinitialisation');
		valeur(b.app.acces.accepterInvitation(ctx, { jeton: lien, motDePasse: mdp }));
		const r = b.app.acces.connecter(ctx, { identifiant: 'camille', motDePasse: mdp, adresse: '1' });
		expect(r.ok).toBe(true);
	});

	it('la réinitialisation refuse un identifiant inconnu', () => {
		const r = b.app.acces.reinitialiser(b.app.ctx(null), 'personne');
		expect(!r.ok && r.erreur.code).toBe('element_introuvable');
	});
});

describe('préférences et mot de passe', () => {
	it('change le mot de passe si l actuel est bon', () => {
		const faux = b.app.acces.changerMotDePasse(b.ctx(), { actuel: 'faux', nouveau: mdp });
		expect(!faux.ok && faux.erreur.code).toBe('mot_de_passe_faux');
		const court = b.app.acces.changerMotDePasse(b.ctx(), {
			actuel: 'mot-de-passe-long',
			nouveau: 'court'
		});
		expect(!court.ok && court.erreur.code).toBe('mot_de_passe_court');
		valeur(b.app.acces.changerMotDePasse(b.ctx(), { actuel: 'mot-de-passe-long', nouveau: mdp }));
		const r = b.app.acces.connecter(b.app.ctx(null), {
			identifiant: 'camille',
			motDePasse: mdp,
			adresse: '1'
		});
		expect(r.ok).toBe(true);
	});

	it('enregistre le thème et les raccourcis', () => {
		valeur(b.app.acces.changerPreferences(b.ctx(), { theme: 'sombre', raccourcis: false }));
		expect(b.app.socle.depots.acces.parId(b.tresorier.id)?.preferences).toEqual({
			theme: 'sombre',
			raccourcis: false
		});
	});
});

describe('argon2id', () => {
	it('stocke au format PHC, 19 Mio et 2 passes', () => {
		const h = creerHacheur();
		const phc = h.hacher(mdp);
		expect(phc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[^$]+\$[^$]+$/);
		expect(h.verifier(mdp, phc)).toBe(true);
		expect(h.verifier('autre chose', phc)).toBe(false);
		expect(h.verifier(mdp, 'pas un phc')).toBe(false);
		expect(h.hacher(mdp)).not.toBe(phc);
	});
});
