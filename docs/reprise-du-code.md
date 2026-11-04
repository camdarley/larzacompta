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

## Écrire un écran

- Une route nouvelle s'ajoute à `src/lib/routes.ts`, sinon elle est refusée : `tests/projet/routes.test.ts` le rappelle.
- Une fonction nouvelle s'ajoute à `#lib/fonctions`, qui pilote navigation et tuiles.
- Un texte d'erreur s'ajoute à `#lib/messages`, jamais dans une route.
- Une couleur vient de `src/lib/ui/jetons.source.json`. Après modification : `pnpm jetons`.
- `goto()` n'accepte plus `noScroll` ni `keepFocus` en Kit 3 : `{ reset: false }` les remplace, et `data-sveltekit-reset="false"` sur un lien.

## Lancer l'application en local

Derrière Caddy, adapter-node 6 lit `PROTOCOL_HEADER` et `HOST_HEADER`. Sans proxy, en http, il faut poser `PROTOCOL_HEADER=x-forwarded-proto` et envoyer cet en-tête, comme le fait `playwright.config.ts`. Sinon, Kit voit une origine en `https` et refuse les formulaires.

Le lien initial s'écrit dans les logs au premier démarrage. `node build/cli/ape.js lien-initial` en réémet un.
