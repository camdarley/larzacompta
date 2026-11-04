import { describe, expect, it } from 'vitest';
import { fonctionLivree, navigation, rolesLivres, type Fonction } from '#lib/fonctions.ts';

describe('#lib/fonctions', () => {
	it('ne montre que les fonctions livrées', () => {
		const n = navigation('tresorier', new Set<Fonction>(['aide']));
		expect(n.groupes).toEqual([]);
		expect(n.bas.map((e) => e.libelle)).toEqual(['Aide']);
	});

	it('ne montre que les entrées autorisées', () => {
		const toutes = new Set<Fonction>(['reglages', 'journal', 'aide', 'pointage', 'caisses']);
		const lecteur = navigation('lecteur', toutes);
		expect(lecteur.bas.map((e) => e.libelle)).toEqual(['Journal', 'Aide']);
		expect(lecteur.groupes.flatMap((g) => g.entrees).map((e) => e.libelle)).toEqual(['Caisses']);
		const compteur = navigation('compteur', toutes);
		expect(compteur.bas.map((e) => e.libelle)).toEqual(['Aide']);
		expect(compteur.groupes).toEqual([]);
	});

	it('expose les fonctions et rôles livrés', () => {
		expect(fonctionLivree('budget')).toBe(false);
		expect(fonctionLivree('journal')).toBe(true);
		expect(rolesLivres()).toEqual(['tresorier']);
	});
});
