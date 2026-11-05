import type { LigneBudget, PositionBudget, SensBudget } from '#lib/domaine/budget/index.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { DepotBudget } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type LigneBrute = {
	exercice_id: number;
	action_id: number | null;
	nature_id: number;
	sens: SensBudget;
	montant_centimes: number;
};

const versLigne = (l: LigneBrute): LigneBudget & { exerciceId: number } => ({
	exerciceId: l.exercice_id,
	actionId: l.action_id,
	natureId: l.nature_id,
	sens: l.sens,
	montant: centimes(l.montant_centimes)
});

export function creerDepotBudget(base: Base): DepotBudget {
	const toutes = base.prepare(`SELECT * FROM budget_ligne ORDER BY exercice_id, id`);
	const lignes = base.prepare(`SELECT * FROM budget_ligne WHERE exercice_id = ? ORDER BY id`);
	const enregistrer = base.prepare(
		`INSERT INTO budget_ligne (exercice_id, action_id, nature_id, sens, montant_centimes)
		 VALUES (@exerciceId, @actionId, @natureId, @sens, @montant)
		 ON CONFLICT (exercice_id, COALESCE(action_id, 0), nature_id, sens)
		 DO UPDATE SET montant_centimes = excluded.montant_centimes`
	);
	const retirer = base.prepare(
		`DELETE FROM budget_ligne
		 WHERE exercice_id = @exerciceId AND COALESCE(action_id, 0) = COALESCE(@actionId, 0)
		   AND nature_id = @natureId AND sens = @sens`
	);
	return {
		toutes: () => (toutes.all() as LigneBrute[]).map(versLigne),
		lignes(exerciceId) {
			return (lignes.all(exerciceId) as LigneBrute[]).map(versLigne);
		},
		enregistrer(exerciceId, l) {
			enregistrer.run({
				exerciceId,
				actionId: l.actionId,
				natureId: l.natureId,
				sens: l.sens,
				montant: l.montant
			});
		},
		retirer(exerciceId, p: PositionBudget) {
			retirer.run({ exerciceId, actionId: p.actionId, natureId: p.natureId, sens: p.sens });
		}
	};
}
