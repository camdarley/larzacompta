/** Commandes serveur : `ape <verbe>`, lancées dans le conteneur par la personne qui gère l'installation. */
import { messageErreur } from '#lib/messages.ts';
import { application, restaurerInstance } from '#lib/server/composition.ts';

const USAGE = `Usage : ape <commande>

  lien-initial                     Émet le lien de création du premier Accès
  reinitialiser-acces <identifiant> Émet un lien de réinitialisation, valable 7 jours
  verifier                         Rejoue les contrôles, l'équation et les empreintes de clôture
  sauvegarder                      Lance une sauvegarde tout de suite
  restaurer [instantané] [--remplacer]
                                   Remet base et fichiers, application arrêtée, puis vérifie`;

function origine() {
	return process.env.ORIGIN ?? 'http://localhost:5173';
}

function lienInitial(): number {
	const app = application();
	const r = app.acces.emettreLienInitial(app.ctx(null));
	if (!r.ok) {
		console.error(messageErreur(r.erreur));
		return 1;
	}
	if (r.valeur === null) {
		console.error(
			'Cette instance a déjà un Accès. Utilisez : ape reinitialiser-acces <identifiant>'
		);
		return 1;
	}
	console.log(`${origine()}/invitation/${r.valeur}`);
	return 0;
}

function reinitialiser(identifiant: string | undefined): number {
	if (!identifiant) {
		console.error(USAGE);
		return 1;
	}
	const app = application();
	const r = app.acces.reinitialiser(app.ctx(null), identifiant);
	if (!r.ok) {
		console.error(`Aucun Accès pour ${identifiant}.`);
		return 1;
	}
	console.log(`${origine()}/invitation/${r.valeur}`);
	return 0;
}

/** Code de sortie 0 seulement si tout tombe juste : un script de restauration s'y fie (AD-17). */
function verifier(): number {
	const app = application();
	const r = app.etats.verifier(app.ctx(null));
	if (!r.ok) {
		console.error(messageErreur(r.erreur));
		return 1;
	}
	if (r.valeur.length === 0) {
		console.log('Tout est juste : invariants, équation de contrôle, empreintes de clôture.');
		return 0;
	}
	for (const v of r.valeur) {
		console.log(`${v.exercice ? `${v.exercice} : ` : ''}[${v.invariant}] ${v.message}`);
	}
	console.log(`${r.valeur.length} contrôle(s) en échec.`);
	return 2;
}

async function sauvegarder(): Promise<number> {
	const app = application();
	const reussie = await app.exploitation.sauvegarder();
	const derniere = app.socle.depots.exploitation.derniere();
	if (!reussie) {
		const detail =
			derniere?.statut === 'en_cours' ? 'Une sauvegarde tourne déjà.' : derniere?.message;
		console.error(`Sauvegarde échouée. ${detail ?? ''}`.trim());
		return 1;
	}
	console.log(`Sauvegarde réussie : instantané ${derniere?.instantane ?? 'inconnu'}.`);
	return 0;
}

async function restaurer(args: string[]): Promise<number> {
	const instantane = args.find((a) => !a.startsWith('--')) ?? 'latest';
	let r;
	try {
		r = await restaurerInstance({ instantane, remplacer: args.includes('--remplacer') });
	} catch (e) {
		console.error(`Restauration impossible. ${e instanceof Error ? e.message : String(e)}`);
		return 1;
	}
	if (!r.ok) {
		console.error(messageErreur(r.erreur));
		return 1;
	}
	console.log('Base et fichiers remis en place. Vérification…');
	application().exploitation.apresRestauration();
	return verifier();
}

async function principal(args: string[]): Promise<number> {
	const [commande, parametre] = args;
	if (commande === 'lien-initial') return lienInitial();
	if (commande === 'reinitialiser-acces') return reinitialiser(parametre);
	if (commande === 'verifier') return verifier();
	if (commande === 'sauvegarder') return sauvegarder();
	if (commande === 'restaurer') return restaurer(args.slice(1));
	console.log(USAGE);
	return commande ? 1 : 0;
}

process.exitCode = await principal(process.argv.slice(2));
