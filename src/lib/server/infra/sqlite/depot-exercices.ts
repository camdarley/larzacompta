import type { Exercice, StatutExercice } from '#lib/domaine/exercices.ts';
import type { DepotExercices } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type Brut = {
	id: number;
	libelle: string;
	annee_debut: number;
	debut: string | null;
	fin: string | null;
	statut: StatutExercice;
};

type ClotureBrute = {
	exercice_id: number;
	cloture_le: string;
	cloture_par: number;
	parametrage_fige_json: string;
	empreinte_sha256: string;
};

const versExercice = (e: Brut): Exercice => ({
	id: e.id,
	libelle: e.libelle,
	anneeDebut: e.annee_debut,
	debut: e.debut,
	fin: e.fin,
	statut: e.statut
});

export function creerDepotExercices(base: Base): DepotExercices {
	const lister = base.prepare('SELECT * FROM exercice ORDER BY annee_debut');
	const creer = base.prepare(`
		INSERT INTO exercice (libelle, annee_debut, debut, fin, statut)
		VALUES (@libelle, @anneeDebut, @debut, @fin, @statut)
	`);
	const figer = base.prepare(`
		INSERT INTO cloture_exercice
			(exercice_id, cloture_le, cloture_par, parametrage_fige_json, empreinte_sha256)
		VALUES (@exerciceId, @clotureLe, @cloturePar, @parametrageFigeJson, @empreinte)
	`);
	const verrouiller = base.prepare("UPDATE exercice SET statut = 'cloture' WHERE id = ?");
	const cloture = base.prepare('SELECT * FROM cloture_exercice WHERE exercice_id = ?');
	return {
		lister: () => (lister.all() as Brut[]).map(versExercice),
		creer: (e) => Number(creer.run(e).lastInsertRowid),
		cloturer(c) {
			figer.run(c);
			verrouiller.run(c.exerciceId);
		},
		cloture(exerciceId) {
			const c = cloture.get(exerciceId) as ClotureBrute | undefined;
			return c
				? {
						exerciceId: c.exercice_id,
						clotureLe: c.cloture_le,
						cloturePar: c.cloture_par,
						parametrageFigeJson: c.parametrage_fige_json,
						empreinte: c.empreinte_sha256
					}
				: null;
		}
	};
}
