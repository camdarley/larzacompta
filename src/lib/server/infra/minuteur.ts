/** Tâches de fond du serveur : battement, sauvegarde après 03:00, lecture de la version publiée. */
import { BATTEMENT_MS } from '#lib/domaine/exploitation.ts';
import type { ModuleExploitation } from '../application/exploitation/index.ts';
import type { Horloge, Journaliseur } from '../application/ports.ts';
import { effacerBattement, ecrireBattement } from './battement.ts';

const TOUR_MS = 10 * 60_000;

export type OptionsMinuteur = {
	dossier: string;
	sauvegarde: boolean;
	versions: boolean;
	exploitation: ModuleExploitation;
	horloge: Horloge;
	journaliseur: Journaliseur;
};

export function demarrerMinuteur(o: OptionsMinuteur) {
	const garder = (tache: () => Promise<void>) => () => {
		// Une tâche de fond en panne se note : elle n'arrête pas l'application.
		tache().catch((e: unknown) => {
			o.journaliseur.erreur('tache_de_fond', { detail: String(e) });
		});
	};

	const battre = () => ecrireBattement(o.dossier, o.horloge.maintenant());
	battre();
	setInterval(battre, BATTEMENT_MS).unref();
	// Émis par adapter-node à l'arrêt propre : `ape restaurer` n'a plus à attendre le silence.
	process.once('sveltekit:shutdown', () => effacerBattement(o.dossier));

	const tour = (demarrage: boolean) => async () => {
		if (o.sauvegarde) await o.exploitation.sauvegarderSiDu(demarrage);
		if (o.versions) await o.exploitation.lireVersionSiDu();
	};
	if (o.sauvegarde) o.exploitation.fermerInterrompues();
	garder(tour(true))();
	setInterval(garder(tour(false)), TOUR_MS).unref();
}
