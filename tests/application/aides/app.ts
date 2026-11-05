import type { AccesConnecte } from '#lib/domaine/acces.ts';
import { composer, type Application } from '#lib/server/composition.ts';
import type { Archiveur, Hacheur, SourceVersions } from '#lib/server/application/ports.ts';
import { baseMigree } from './base.ts';

/** Hacheur de test : argon2 est testé à part, et ralentirait inutilement chaque cas. */
const hacheurRapide: Hacheur = {
	hacher: async (m) => `test$${m}`,
	verifier: async (m, phc) => phc === `test$${m}`
};

export type ArchiveurDeTest = Archiveur & {
	appels: { controler: boolean }[];
	panne: string | null;
};
export type SourceVersionsDeTest = SourceVersions & { publiee: string | null; lectures: number };

export type Banc = {
	app: Application;
	archiveur: ArchiveurDeTest;
	versions: SourceVersionsDeTest;
	/** SHA-256 factice → octets : aucun fichier n'est écrit par les tests d'application. */
	fichiers: Map<string, Uint8Array>;
	horloge: { instant: string; maintenant(): string };
	base: ReturnType<typeof baseMigree>;
	tresorier: AccesConnecte;
	ctx(): ReturnType<Application['ctx']>;
	journal(): { evenement: string; resume: string; acces_nom: string }[];
};

export function banc(instant = '2026-11-04T10:00:00.000Z'): Banc {
	const base = baseMigree();
	const horloge = {
		instant,
		maintenant() {
			return this.instant;
		}
	};
	const fichiers = new Map<string, Uint8Array>();
	const archiveur: ArchiveurDeTest = {
		horsVps: true,
		appels: [],
		panne: null,
		async sauvegarder(options) {
			this.appels.push(options);
			if (this.panne !== null) throw new Error(this.panne);
			return { instantane: 'a1b2c3d4' };
		}
	};
	const versions: SourceVersionsDeTest = {
		publiee: null,
		lectures: 0,
		async derniere() {
			this.lectures += 1;
			return this.publiee;
		}
	};
	const app = composer({
		base,
		horloge,
		hacheur: hacheurRapide,
		journaliseur: { info() {}, erreur() {} },
		fichiers: {
			ecrire(octets) {
				// Adressé par contenu, comme le vrai stockage : le même fichier garde son adresse.
				const connu = [...fichiers].find(([, o]) => Buffer.compare(o, octets) === 0);
				if (connu) return connu[0];
				const sha = `fichier-${fichiers.size + 1}`;
				fichiers.set(sha, octets);
				return sha;
			},
			lire: (sha) => fichiers.get(sha) ?? null,
			existe: (sha) => fichiers.has(sha),
			lister: () => [...fichiers.keys()].map((sha256) => ({ sha256, modifieLe: instant })),
			supprimer: (sha) => void fichiers.delete(sha)
		},
		archiveur,
		versions
	});
	const id = app.socle.depots.acces.creer({
		identifiant: 'camille',
		nomAffiche: 'Camille Fictive',
		role: 'tresorier',
		hash: 'test$mot-de-passe-long',
		creeLe: instant
	});
	const tresorier: AccesConnecte = {
		id,
		identifiant: 'camille',
		nomAffiche: 'Camille Fictive',
		role: 'tresorier',
		preferences: { theme: 'systeme', raccourcis: true }
	};
	return {
		app,
		archiveur,
		versions,
		fichiers,
		horloge,
		base,
		tresorier,
		ctx: () => app.ctx(tresorier),
		journal: () =>
			base
				.prepare('SELECT evenement, resume, acces_nom FROM journal_modification ORDER BY id')
				.all() as { evenement: string; resume: string; acces_nom: string }[]
	};
}
