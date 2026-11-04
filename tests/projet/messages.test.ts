import { describe, expect, it } from 'vitest';
import { CODES_MESSAGES, message, messageErreur } from '#lib/messages.ts';
import { sources } from './fichiers.ts';

describe('catalogue des messages', () => {
	it('remplit les paramètres', () => {
		expect(message('ventilation_incomplete', { montant: '150,00 €' })).toBe(
			'Il reste 150,00 € à répartir. Ajoutez une Ligne ou corrigez un montant.'
		);
		expect(message('trou_de_dates', { debut: '3', fin: '28 mars' })).toBe(
			'Aucune ligne entre le 3 et le 28 mars. Il manque peut-être un relevé.'
		);
	});

	it('ne montre jamais un code technique', () => {
		expect(messageErreur({ code: 'code_inconnu' })).toBe(message('erreur_serveur'));
		expect(messageErreur({ code: 'dernier_tresorier' })).toBe(
			'Il faut garder au moins un Accès trésorier·e actif.'
		);
		expect(messageErreur({ code: 'exercice_cloture' })).toContain('Cet Exercice est clôturé');
		expect(
			messageErreur({ code: 'exercice_cloture', details: { exercice: '2025-2026' } })
		).toContain('2025-2026 est clôturé');
	});

	it('couvre chaque code levé par le code applicatif', () => {
		const codes = new Set<string>();
		for (const { contenu } of [...sources('src/lib/domaine'), ...sources('src/lib/server')]) {
			for (const m of contenu.matchAll(/echec(?:<[^>]*>)?\('([a-z_]+)'/g))
				codes.add(m[1] as string);
		}
		const absents = [...codes].filter((c) => !(CODES_MESSAGES as string[]).includes(c));
		expect(absents).toEqual([]);
	});

	it("aucun texte d'erreur n'existe hors du catalogue", () => {
		const fautifs = [
			...sources('src/routes'),
			...sources('src/lib/server'),
			...sources('src/lib/ui')
		]
			.filter(({ contenu }) =>
				/\bfail\(\s*\d+\s*,\s*['"`]|\berror\(\s*\d+\s*,\s*['"`]|echec\(\s*['"`][^'"`]*\s/.test(
					contenu
				)
			)
			.map((f) => f.chemin);
		expect(fautifs).toEqual([]);
	});
});
