import type { DepotJournal, EntreeJournal } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type LigneBrute = {
	id: number;
	horodatage: string;
	acces_id: number | null;
	acces_nom: string;
	evenement: string;
	entite_type: string;
	entite_id: number | null;
	resume: string;
};

function versEntree(l: LigneBrute): EntreeJournal {
	return {
		id: l.id,
		horodatage: l.horodatage,
		accesId: l.acces_id,
		accesNom: l.acces_nom,
		evenement: l.evenement,
		entiteType: l.entite_type,
		entiteId: l.entite_id,
		resume: l.resume
	};
}

export function creerDepotJournal(base: Base): DepotJournal {
	const ajouter = base.prepare(`
		INSERT INTO journal_modification
			(horodatage, acces_id, acces_nom, evenement, entite_type, entite_id, resume, avant_json, apres_json)
		VALUES
			(@horodatage, @accesId, @accesNom, @evenement, @entiteType, @entiteId, @resume, @avantJson, @apresJson)
	`);
	const filtre = `
		WHERE (@personne IS NULL OR acces_nom = @personne)
		  AND (@type IS NULL OR entite_type = @type)
		  AND (@depuis IS NULL OR horodatage >= @depuis)
		  AND (@jusqua IS NULL OR horodatage < @jusqua)
	`;
	const lister = base.prepare(`
		SELECT id, horodatage, acces_id, acces_nom, evenement, entite_type, entite_id, resume
		FROM journal_modification ${filtre}
		ORDER BY horodatage DESC, id DESC
		LIMIT @limite OFFSET @decalage
	`);
	const compter = base.prepare(`SELECT count(*) FROM journal_modification ${filtre}`).pluck();
	const personnes = base
		.prepare('SELECT DISTINCT acces_nom FROM journal_modification ORDER BY acces_nom')
		.pluck();
	const types = base
		.prepare('SELECT DISTINCT entite_type FROM journal_modification ORDER BY entite_type')
		.pluck();

	const parEntite = base.prepare(`
		SELECT id, horodatage, acces_id, acces_nom, evenement, entite_type, entite_id, resume
		FROM journal_modification WHERE entite_type = ? AND entite_id = ?
		ORDER BY horodatage DESC, id DESC
	`);
	const entiteDeCle = base
		.prepare(
			`SELECT entite_id FROM journal_modification
			 WHERE json_extract(apres_json, '$.cle') = ? ORDER BY id DESC LIMIT 1`
		)
		.pluck();

	return {
		ajouter: (e) => void ajouter.run(e),
		lister(filtres, page) {
			const parametres = {
				personne: filtres.personne ?? null,
				type: filtres.type ?? null,
				depuis: filtres.depuis ?? null,
				jusqua: filtres.jusqua ?? null
			};
			return {
				entrees: (lister.all({ ...parametres, ...page }) as LigneBrute[]).map(versEntree),
				total: compter.get(parametres) as number
			};
		},
		personnes: () => personnes.all() as string[],
		types: () => types.all() as string[],
		parEntite: (entiteType, entiteId) =>
			(parEntite.all(entiteType, entiteId) as LigneBrute[]).map(versEntree),
		entiteDeCle: (cle) => (entiteDeCle.get(cle) as number | undefined) ?? null
	};
}
