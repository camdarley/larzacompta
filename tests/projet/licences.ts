/** Licences compatibles avec une diffusion sous AGPL-3.0 (AD-24). */
const COMPATIBLES = new Set(
	[
		'MIT',
		'MIT-0',
		'ISC',
		'0BSD',
		'BSD-2-Clause',
		'BSD-3-Clause',
		'Apache-2.0',
		'BlueOak-1.0.0',
		'CC0-1.0',
		'Unlicense',
		'Python-2.0',
		'MPL-2.0',
		'OFL-1.1',
		'LGPL-3.0-only',
		'LGPL-3.0-or-later',
		'GPL-3.0-only',
		'GPL-3.0-or-later',
		'AGPL-3.0-only',
		'AGPL-3.0-or-later'
	].map((l) => l.toLowerCase())
);

/** Accepte une expression SPDX simple : `A OR B`, `(A AND B)`. */
export function licenceCompatible(expression: string | undefined): boolean {
	if (!expression) return false;
	const nette = expression.replace(/[()]/g, ' ').trim();
	return nette
		.split(/\s+OR\s+/i)
		.some((alternative) =>
			alternative.split(/\s+AND\s+/i).every((l) => COMPATIBLES.has(l.trim().toLowerCase()))
		);
}
