import { ETAPE_ASSISTANT_TERMINE } from '#lib/domaine/assistant.ts';
import { peut } from '#lib/domaine/droits.ts';
import { phraseBilan } from '#lib/domaine/etats/controle.ts';
import { fonctionLivree } from '#lib/fonctions.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const app = application();
	const acces = accesRequis(locals.acces);
	const ctx = app.ctx(acces);
	const { exercice, exercices } = await parent();
	const bandeaux = peut(acces.role, 'parametrer') ? exiger(app.exploitation.bandeaux(ctx)) : [];
	const association = app.parametrage.association();
	const pret = (association?.etapeAssistant ?? 0) >= ETAPE_ASSISTANT_TERMINE && exercice !== null;
	if (!pret || exercice === null) return { pret: false as const, bandeaux };

	const tableau = exiger(app.etats.tableau(ctx, exercice));
	const saisir = peut(acces.role, 'saisir');
	// L'Exercice terminé le plus ancien : c'est lui qui se clôture en premier (E3).
	const aClore = [...exercices]
		.filter((e) => e.statut === 'ouvert' && e.fin !== null && e.fin < ctx.aujourdhui)
		.sort((a, b) => a.anneeDebut - b.anneeDebut)[0];
	return {
		pret: true as const,
		bandeaux,
		...tableau,
		phrase: phraseBilan(tableau.bilan),
		pointage: fonctionLivree('pointage') && saisir,
		caisses: fonctionLivree('caisses') && peut(acces.role, 'consulter_suivi'),
		aClore: saisir ? (aClore ?? null) : null
	};
}
