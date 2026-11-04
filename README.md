# APE Compta

Outil libre de comptabilité analytique pour une association de parents d'élèves. Une instance sert une APE. Licence AGPL-3.0.

## Démarrer

```sh
pnpm install
pnpm dev
```

Node 26.13 et pnpm 12.16 sont attendus (`.node-version`, champ `packageManager`).

| Script            | Rôle                                                          |
| ----------------- | ------------------------------------------------------------- |
| `pnpm dev`        | Serveur de développement                                      |
| `pnpm build`      | Application (`build/`) et commande `ape` (`build/cli/ape.js`) |
| `pnpm check`      | Types, Svelte compris                                         |
| `pnpm lint`       | Prettier et ESLint                                            |
| `pnpm test`       | Domaine, application, garde-fous du projet                    |
| `pnpm test:e2e`   | Parcours Playwright sur le serveur construit                  |
| `pnpm test:prive` | Contrôle sur `.private/`, sauté si le dossier manque          |

La reprise du code est décrite dans [`docs/reprise-du-code.md`](docs/reprise-du-code.md). Les décisions prises sans arbitrage humain sont dans [`DECISIONS.md`](DECISIONS.md).
