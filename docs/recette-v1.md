# Recette de la v1

Cette page dit ce qui est prouvé, et ce qui ne peut l'être qu'à l'usage. Rien n'y est présumé : un critère qui dépend d'une personne réelle ou d'une année réelle reste à mesurer.

Rejouer les preuves :

```sh
pnpm check && pnpm lint && pnpm test && pnpm test:e2e
pnpm test:cycle && pnpm test:cycle:montee
pnpm test:prive   # sauté si .private/ est absent
```

## Dernière recette

Le 5 novembre 2026, sur la version candidate 1.0.0 : `check` et `lint` sans erreur, 1 604 tests sans navigateur, 406 parcours Playwright sous Chromium et 406 sous WebKit, couverture du domaine au-dessus de 95 %, cycle de version et montée prouvés avec Docker, `test:prive` vert. La recherche des mots, IBAN et numéros de `.private/` dans les fichiers suivis par Git n'a trouvé aucun nom, IBAN ni n° de chèque réel.

## Critères de succès

| Critère | Énoncé court                                                                  | État                    | Preuve                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SM-1    | Document d'AG du premier Exercice complet produit sans Excel                  | À mesurer en usage réel | La chaîne est prouvée sur données fictives (`tests/parcours/33-recette.spec.ts`, UJ-3) et sur l'Exercice 2025-2026 privé. Le critère porte sur le premier Exercice réellement tenu dans l'outil       |
| SM-2    | Écart nul à la clôture, ou chaque euro restant rattaché à une cause           | Vérifié                 | Clôture et récapitulatif (`tests/application/cloture.test.ts`, `tests/parcours/19-etats.spec.ts`), Écarts restants au Document d'AG, jeu privé décomposé sans reste (`tests/prive/jeu-prive.test.ts`) |
| SM-3    | Jeu tiré de 2025-2026 : résultat d'AG au centime, écart décomposé             | Vérifié                 | `pnpm test:prive`. Les chiffres vivent dans `.private/`, hors dépôt                                                                                                                                   |
| SM-4    | Un mois type de 15 Lignes se pointe en moins de 15 minutes                    | À mesurer en usage réel | UJ-1 aboutit au clavier jusqu'à l'Écart nul (`tests/parcours/21-jalon-1.spec.ts`). Le temps d'une personne reste à chronométrer, et la cible à fixer après mesure du temps actuel                     |
| SM-5    | Une personne extérieure retrouve une Pièce depuis une Action en moins d'1 min | À mesurer en usage réel | Le parcours Lecture, de la connexion à la Pièce et à la banque, passe sous la minute, automate compris (`tests/parcours/33-recette.spec.ts`). Il reste à l'observer avec une vraie personne           |
| SM-6    | Une autre APE installe l'outil et tient un Exercice sans aide directe         | À mesurer en usage réel | Installation rejouée sur machine vierge (`tests/cycle/machine-vierge.ts`), cycle de version et restauration (`tests/cycle/cycle.ts`). Aucune autre APE ne l'a encore fait                             |
| SM-7    | Une personne novice saisit, ventile, retrouve un solde, sans aide, en 10 min  | À mesurer en usage réel | UJ-4 aboutit sans étape cachée (`tests/parcours/33-recette.spec.ts`). Seule une personne novice peut le confirmer                                                                                     |

## Ce qui attend la personne qui tient la trésorerie

- **OQ-3, mentions de Facture.** Les mentions sont vides par défaut, avec un rappel à vérifier. Faire confirmer, sur une source officielle, les mentions requises et l'application de la facturation électronique, puis les saisir dans Réglages.
- **OQ-4, soldes d'ouverture au 01/09/2026.** À fixer en reprenant le dernier relevé réel de chaque Compte et le dernier comptage de caisse. L'assistant les demande.
- **OQ-5, livret et SumUp.** Fournir un export réel du livret s'il existe, et un export SumUp pour savoir si ses colonnes donnent le brut et les frais. Sans ces fichiers, le livret se saisit à la main et les frais SumUp se répartissent à la main.
- **OQ-7, identifiants OFX.** Fournir deux exports réels du même Compte, pris à des dates différentes, pour vérifier que l'identifiant de transaction reste stable et mesurer la fenêtre de l'export. L'outil se protège déjà d'une répétition, en signalant les Lignes à confirmer.
- **Passe VoiceOver (UX-DR27).** À faire par une personne qui écoute le rendu, sur UJ-2 et UJ-3. L'arbre d'accessibilité est vérifié par les tests, jamais l'écoute.
- **Essai sur un vrai téléphone.** Le Comptage au pouce et la photo d'une Pièce sont vérifiés sur émulation et simulateur. Un essai en conditions réelles reste à faire avant la première kermesse.
