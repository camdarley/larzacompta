# APE Compta

Outil libre de comptabilité analytique pour une association de parents d'élèves. Une instance sert une APE. Licence AGPL-3.0.

## Ce que fait la v1

- **Tenir l'année** : Opérations ventilées par Nature et par Action, Pointage des relevés OFX et CSV, Pièces justificatives, Créances et Dettes.
- **Suivre l'argent de l'évènement** : Sessions et Comptages de caisse sur téléphone, chèques reçus, Remises et bordereaux, chèques émis, versements SumUp.
- **Présenter** : Tableau de contrôle, résultat par Action, Compte de résultat, État de trésorerie, Document d'AG, comparaison entre Exercices, Budget, Factures émises et Avoirs.
- **Confier** : trois rôles (Trésorerie, Comptage, Lecture), Journal des modifications, clôture, sauvegarde chiffrée, restauration.

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
| `pnpm test:cycle` | Sauvegarde, restauration, montée de version, avec Docker      |

## Documentation

- [Installer](docs/installation.md)
- [Mettre à jour](docs/mise-a-jour.md)
- [Restaurer](docs/restauration.md)
- [Transmettre l'instance](docs/transmission.md)
- [Reprendre le code](docs/reprise-du-code.md)
- [Recette de la v1](docs/recette-v1.md)
- [Journal des versions](CHANGELOG.md)

Les décisions prises sans arbitrage humain sont dans [`DECISIONS.md`](DECISIONS.md).
