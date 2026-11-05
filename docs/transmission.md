# Transmettre l'instance

Une APE change de bureau chaque année ou presque. Cette page dit ce qui passe d'une personne à l'autre, pour que rien ne se perde en route. Elle se fait de préférence ensemble, avant l'assemblée générale.

## Qui fait quoi

- **Le·la trésorier·e** tient les comptes dans l'outil.
- **La personne qui gère l'installation** tient le serveur. Ce peut être la même personne.

## Transmettre la trésorerie

1. Dans Réglages, Accès, créez un Accès trésorier·e pour la personne qui arrive, et donnez-lui le lien à usage unique.
2. Montrez-lui le Tableau de contrôle, Créances et Dettes, et l'Aide, en particulier « Votre première année ».
3. Une fois qu'elle s'est connectée, révoquez l'Accès de la personne qui part. Le Journal garde tout ce qu'elle a fait.

Rien de plus : aucun fichier à envoyer, aucune donnée à recopier.

## Faire vérifier les comptes

Avant l'assemblée générale, créez un Accès avec le rôle Lecture pour la personne qui vérifie. Elle consulte Tableau de contrôle, Opérations, Pièces, Actions, États, Journal, Caisses, Chèques, Créances et Dettes, et peut tout télécharger. Elle ne peut rien modifier, et le Pointage, le Budget, les Factures et les Réglages ne lui sont pas ouverts. Révoquez cet Accès une fois le contrôle terminé.

## Transmettre l'installation

La personne qui reprend doit recevoir, par un canal sûr :

- l'accès au serveur et l'adresse de l'hébergeur ;
- l'accès au nom de domaine ;
- le fichier `.env` ;
- **`RESTIC_PASSWORD`**, conservé hors du serveur : sans lui, aucune sauvegarde ne se relit ;
- les accès au dépôt de sauvegarde ;
- ces documents, et la date de la dernière restauration essayée.

Puis, ensemble :

1. Vérifiez que `docker compose ps` indique `healthy`.
2. Lancez une sauvegarde : `docker compose exec app ape sauvegarder`.
3. Essayez une restauration sur une autre machine, en suivant `docs/restauration.md`.
4. Changez les mots de passe de l'hébergeur et retirez les anciennes clés SSH.

## Changer de serveur

1. Installez le nouveau serveur avec `docs/installation.md` jusqu'à l'étape 4, avec les mêmes `RESTIC_REPOSITORY` et `RESTIC_PASSWORD`.
2. Sur l'ancien, lancez une dernière sauvegarde, puis arrêtez l'application :

```sh
docker compose exec app ape sauvegarder
docker compose stop app
```

3. Sur le nouveau, restaurez, puis démarrez :

```sh
docker compose run --rm app ape restaurer
docker compose up -d
```

4. Faites pointer le nom de domaine vers le nouveau serveur. Caddy obtient son certificat à la première visite.

## Si un Accès est perdu

Il n'y a pas de récupération par e-mail. La personne qui gère l'installation émet un lien de réinitialisation, valable 7 jours :

```sh
docker compose exec app ape reinitialiser-acces <identifiant>
```

## Quand l'APE arrête l'outil

Réglages, Sauvegardes, Export complet donne une archive lisible sans l'outil : Opérations, Lignes, Pointages et Pièces. Gardez-la 10 ans avec les états de chaque Exercice.
