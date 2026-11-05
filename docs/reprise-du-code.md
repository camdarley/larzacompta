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

## Relevés et Pointage

- Une banque ne se connaît que dans `src/lib/server/infra/sources/`. Une source nouvelle implémente `SourceReleve` et rend un `ReleveNormalise` : le reste du chemin ne change pas.
- `.gitignore` protège tout `*.ofx`. Les relevés de test sont donc écrits en TypeScript, dans `tests/jeux/releve-fictif.ts`. Garder cette règle telle quelle.
- `proposer()` ne fait que lire : seul `pointage.pointer()` et ses variantes (`ajuster`, `creerDepuisLigne`) créent un Pointage. Un test échoue si `proposer` est importé hors de `domaine/releve`.

## Lancer l'application en local

Derrière Caddy, adapter-node 6 lit `PROTOCOL_HEADER` et `HOST_HEADER`. Sans proxy, en http, il faut poser `PROTOCOL_HEADER=x-forwarded-proto` et envoyer cet en-tête, comme le fait `playwright.config.ts`. Sinon, Kit voit une origine en `https` et refuse les formulaires.

Le lien initial s'écrit dans les logs au premier démarrage. `node build/cli/ape.js lien-initial` en réémet un.

## Tâches de fond et exploitation

- Le module `exploitation` possède `sauvegarde_execution` et `version_disponible`. Ses décisions sont pures, dans `src/lib/domaine/exploitation.ts`. Seul `infra/sauvegarde/restic.ts` parle à restic.
- `hooks.server.ts` lance `demarrerTachesDeFond()` : un battement dans `/data/serveur-en-marche`, et un tour toutes les 10 minutes. `APE_SAUVEGARDE=1` est posé par l'image : hors de Docker, pas de restic, donc pas de minuteur.
- Un fichier nouveau dans `fichiers/` doit être connu de `retirerOrphelins()`, sinon il disparaîtra à la sauvegarde suivante. Aujourd'hui : les Pièces et les relevés importés.
- `.dockerignore` est une liste blanche, parce que l'image sert son propre code sur `/code-source`. Un fichier ajouté à la racine doit y entrer s'il fait partie du code.
- Le projet tourne en deux modes. Vite transpile le serveur, mais `tests/cycle/` et `scripts/` passent par Node seul, en mode strip-only : pas de propriété de paramètre (`constructor(readonly x)`) ni d'`enum` dans `src/lib/server/`.

## Avant la première version publique

Deux choix attendent la publication du projet, sans bloquer une installation depuis les sources :

- `URL_VERSIONS` dans `src/lib/produit.ts`. Vide, aucun appel n'est fait et le `bandeau` de version ne peut pas s'afficher.
- L'image publiée : `.github/workflows/version.yml` la pousse sur le registre du dépôt, et `APE_IMAGE` la désigne dans `.env`.

## Tests

| Niveau                       | Commande                                                        | Quand                                                           |
| ---------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Domaine, application, projet | `pnpm test`                                                     | À chaque commit                                                 |
| Parcours                     | `pnpm test:e2e`                                                 | Avant un commit qui touche l'interface                          |
| Cycle                        | `pnpm test:cycle`                                               | À chaque version. Docker requis, restic vient de l'image        |
| Montée de version            | `pnpm test:cycle:montee`                                        | Quand le cycle change. Clone jetable, migration fausse comprise |
| Machine vierge               | `pnpm test:machine-vierge`                                      | Quand les guides ou le déploiement changent. Docker requis      |
| Aperçu PDF dans Chrome       | `NAVIGATEUR_REEL=<dossier> pnpm exec playwright test 24-apercu` | Quand l'aperçu change. Regarder la capture                      |
| Données privées              | `pnpm test:prive`                                               | Sur un poste qui a `.private/`                                  |

`tests/jeux/charger.ts` charge un Exercice complet : `chargerDansDossier()` pour obtenir une instance à regarder, `chargerJeu()` dans un test d'application. Ses résultats attendus sont dans `ATTENDUS_COMPLET`.
