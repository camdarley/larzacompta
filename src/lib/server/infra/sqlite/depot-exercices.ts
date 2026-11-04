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
	return {
		lister: () => (lister.all() as Brut[]).map(versExercice),
		creer: (e) => Number(creer.run(e).lastInsertRowid)
	};
}
