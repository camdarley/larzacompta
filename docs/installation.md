# Installer l'outil

Ce guide s'adresse à une personne capable d'administrer un serveur Linux. Une installation sert une seule APE. Comptez une heure.

## Ce qu'il vous faut

- Un serveur Linux avec 1 Go de mémoire, 1 vCPU, 10 Go de disque, Git, et Docker avec son extension Compose.
- Un nom de domaine, ou un sous-domaine, qui pointe vers ce serveur.
- Les ports 80 et 443 ouverts et libres. Caddy s'en sert pour obtenir et servir le certificat HTTPS.
- Un dépôt de sauvegarde **hors de ce serveur** : un espace compatible S3 chez un autre hébergeur, ou un serveur SFTP. Le choix vous revient.

## 1. Récupérer le projet

```sh
git clone <adresse-du-depot> ape-compta
cd ape-compta
cp .env.example .env
```

## 2. Remplir `.env`

Trois réglages sont à faire, le reste a déjà la bonne valeur.

- `ORIGIN` : l'adresse publique, par exemple `https://compta.exemple.org`, sans chemin ni barre finale.
- `RESTIC_PASSWORD` : le mot de passe qui chiffre les sauvegardes. Générez-le :

```sh
openssl rand -base64 32
```

- `RESTIC_REPOSITORY` et ses identifiants : l'étape suivante.

## 3. Configurer la copie hors du serveur

Cette étape est obligatoire. Sans elle, une panne du serveur emporte aussi les sauvegardes, et l'outil le rappelle en permanence par un bandeau « copie hors du VPS à configurer ».

Pour un espace compatible S3, ajoutez à `.env` :

```sh
RESTIC_REPOSITORY=s3:https://s3.exemple.org/nom-du-seau
AWS_ACCESS_KEY_ID=identifiant-fourni-par-l-hebergeur
AWS_SECRET_ACCESS_KEY=secret-fourni-par-l-hebergeur
```

Pour un serveur SFTP, indiquez `RESTIC_REPOSITORY=sftp:ape@sauvegarde.exemple.org:/depot`, puis donnez sa clé à l'application dans un fichier `compose.override.yaml` :

```yaml
services:
  app:
    volumes:
      - ./cle-sftp:/home/node/.ssh:ro
```

Tout dépôt reconnu par restic convient. La liste est dans la documentation de restic.

## 4. Mettre `RESTIC_PASSWORD` à l'abri

Cette étape est obligatoire elle aussi. Copiez `RESTIC_PASSWORD` **hors du serveur**, dans un gestionnaire de mots de passe de l'APE par exemple. Sans lui, personne ne peut relire aucune sauvegarde, et il fait partie de la transmission (voir `docs/transmission.md`).

## 5. Démarrer

```sh
docker compose up -d --build
docker compose ps
```

`app` et `caddy` passent à l'état `running`, et `app` indique `healthy`. La première construction prend quelques minutes.

## 6. Créer le premier Accès

Le lien de création du premier Accès s'écrit dans les logs :

```sh
docker compose logs app | grep lien_initial
```

S'il est perdu ou expiré, redemandez-en un :

```sh
docker compose exec app ape lien-initial
```

Ouvrez ce lien, choisissez un identifiant et un mot de passe, puis laissez-vous guider par l'assistant de démarrage. Avant ce premier Accès, `ape verifier` signale `[A1]` : c'est normal.

## 7. Vérifier la sauvegarde

Une sauvegarde part au démarrage, puis chaque nuit après 3 h. Dans l'outil, ouvrez Réglages, Sauvegardes : la dernière réussite s'affiche, et la copie hors du VPS indique « Configurée ». Pour en lancer une à la main :

```sh
docker compose exec app ape sauvegarder
```

Faites ensuite un essai de restauration sur une autre machine : c'est la seule preuve qu'elle marche. Voir `docs/restauration.md`.

## Pour un essai sur votre poste

Avec `ORIGIN=https://localhost`, Caddy crée un certificat local : le navigateur l'annonce comme non reconnu, ce qui est normal pour un essai.

## Ce qui tourne

| Service | Rôle                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| `app`   | Application et sauvegarde. Non exposé. Ses données sont dans le volume `/data`. |
| `caddy` | Seul service exposé. Gère HTTPS et HSTS.                                        |

Le volume `/data` contient `base.sqlite`, `fichiers/` pour les Pièces et les relevés, `sauvegardes/`, et `avant-migration/`. Les logs sont en JSON sur la sortie standard, avec une rotation à 3 fichiers de 10 Mo. Aucune télémétrie n'est émise.

## Réglages avancés

| Variable             | Rôle                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `VERIFIER_VERSION=0` | Désactive la lecture quotidienne de la dernière version publiée. Elle ne transmet aucun identifiant. |
| `BODY_SIZE_LIMIT`    | Taille maximale d'une requête. Une Pièce pèse 20 Mo au plus.                                         |
| `XFF_DEPTH`          | Nombre de proxys devant l'application. Reste à 1 avec Caddy.                                         |
| `APE_IMAGE`          | Image à utiliser plutôt que de la construire ici.                                                    |
