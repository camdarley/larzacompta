# Reprendre le code

Ce document aide un·e mainteneur·se bénévole à reprendre le projet sans dépendre de la mémoire de quelqu'un.

## Repères

- Hexagonal à cœur pur : `src/lib/domaine/` calcule et décide, `src/lib/server/application/` orchestre une transaction, `src/lib/server/infra/` parle au monde. Seul `src/lib/server/composition.ts` instancie les adaptateurs.
- Ces frontières sont contrôlées par `tests/projet/frontieres.test.ts` et par ESLint (`no-restricted-imports`).
- Toute écriture passe par `executer()`, qui contrôle le droit, ouvre la transaction et écrit au Journal.

## SvelteKit 3

- La configuration vit dans `vite.config.ts`, dans l'appel à `sveltekit({ ... })`. Il n'y a plus de `svelte.config.js`.
- `tsconfig.json` étend `$app/tsconfig`, écrit dans `node_modules/` par `svelte-kit sync`.

## L'alias `#lib/...`

L'alias est déclaré dans le champ `imports` de `package.json`, et non dans une configuration Vite. Tout import porte son extension : `#lib/domaine/montant.ts`, `#lib/ui/Bouton.svelte`.

Limites constatées :

- `svelte-kit sync` doit avoir tourné avant `svelte-check` ou `tsc` : le script `pnpm check` s'en charge.
- Node résout l'alias seul, mais un fichier `.svelte` ne se charge qu'à travers Vite. Un script lancé directement avec `node` n'importe donc que des modules `.ts` sans composant.
