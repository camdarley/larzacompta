# Restaurer les données

Une sauvegarde contient la base et toutes les Pièces. Elle se restaure sur le même serveur après une erreur, ou sur un serveur neuf après une panne.

## Ce qu'il vous faut

- Le dépôt de sauvegarde : la valeur de `RESTIC_REPOSITORY`, et ses identifiants.
- Le mot de passe `RESTIC_PASSWORD`. Sans lui, aucune sauvegarde ne se relit : personne ne peut le retrouver à votre place.
- Le dossier du projet avec son `.env`. Sur un serveur neuf, suivez d'abord `docs/installation.md` jusqu'au remplissage de `.env`, sans lancer l'application.

## Sur un serveur neuf

1. Vérifiez que `.env` reprend `ORIGIN`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` et les identifiants du dépôt.
2. Restaurez :

```sh
docker compose run --rm app ape restaurer
```

3. Attendez le message `Tout est juste`. La commande rejoue d'elle-même `ape verifier` : invariants, équation de contrôle, empreintes de clôture, présence du fichier de chaque Pièce.
4. Démarrez :

```sh
docker compose up -d
```

Les Accès, leurs mots de passe et leurs sessions reviennent avec la base.

## Sur une installation qui tourne déjà

La commande refuse de s'exécuter à côté de l'application. Arrêtez-la, puis attendez 30 secondes si elle s'est arrêtée brutalement :

```sh
docker compose stop app
```

Sur une installation qui contient déjà des données, il faut le demander explicitement. La base, son journal d'écriture (`-wal`) et les fichiers en place ne sont pas effacés : ils sont gardés dans `/data/avant-restauration/`. Après un arrêt brutal, les dernières écritures s'y retrouvent à la première ouverture de cette copie.

```sh
docker compose run --rm app ape restaurer --remplacer
docker compose up -d
```

## Revenir à une date précise

`latest` est la sauvegarde la plus récente. Pour en choisir une autre, listez-les puis nommez-la :

```sh
docker compose run --rm app restic snapshots
docker compose run --rm app ape restaurer 4f2a9c1e --remplacer
```

Sans `RESTIC_REPOSITORY`, ajoutez `-e RESTIC_REPOSITORY=/data/sauvegardes/depot` à la commande `restic snapshots`.

## Après la restauration

- Les saisies faites après la sauvegarde sont perdues : une journée au plus.
- Une sauvegarde repart au démarrage de l'application.
- Si `ape verifier` signale un contrôle en échec, ne saisissez rien et gardez le message : il nomme le contrôle et l'Exercice concernés.
