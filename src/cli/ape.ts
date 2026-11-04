/** Commandes serveur : `ape <verbe>`, lancées dans le conteneur par la personne qui gère l'installation. */
import { messageErreur } from '#lib/messages.ts';
import { application } from '#lib/server/composition.ts';

const USAGE = `Usage : ape <commande>

  lien-initial                     Émet le lien de création du premier Accès
  reinitialiser-acces <identifiant> Émet un lien de réinitialisation, valable 7 jours`;

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

function principal(args: string[]): number {
	const [commande, parametre] = args;
	if (commande === 'lien-initial') return lienInitial();
	if (commande === 'reinitialiser-acces') return reinitialiser(parametre);
	console.log(USAGE);
	return commande ? 1 : 0;
}

process.exitCode = principal(process.argv.slice(2));
