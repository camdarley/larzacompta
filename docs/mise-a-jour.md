# Mettre à jour l'outil

Une mise à jour garde les données. Avant chaque migration, l'application copie la base dans `/data/avant-migration/`, et une migration en échec arrête le démarrage sans rien abîmer.

## Quand mettre à jour

Le·la trésorier·e voit un bandeau au Tableau de contrôle quand une version plus récente est publiée. Une mise à jour peut contenir des correctifs de sécurité : ne la laissez pas attendre.

## Depuis une image publiée

Si `APE_IMAGE` est posée dans `.env` :

```sh
docker compose pull && docker compose up -d
```

## Depuis les sources

Sans `APE_IMAGE`, l'image se construit sur le serveur :

```sh
git pull
docker compose up -d --build
```

## Vérifier

```sh
docker compose ps
docker compose exec app ape verifier
```

`app` indique `healthy`, et `ape verifier` répond `Tout est juste`. Réglages, À propos donne la version installée.

## Si quelque chose se passe mal

Si `app` ne démarre pas, lisez la raison :

```sh
docker compose logs app --tail 30
```

Pour revenir en arrière, remettez la version précédente (`git checkout` du tag, ou `APE_IMAGE`) et restaurez la dernière sauvegarde : voir `docs/restauration.md`. Une migration ajoute à la base sans jamais rien retirer, mais une ancienne version ne connaît pas ce qu'une plus récente a ajouté.

## Mettre à jour Docker et le serveur

Les mises à jour du système se font comme d'habitude. Le service redémarre seul après un redémarrage du serveur. Si `app` redémarre pendant une sauvegarde, celle-ci compte pour un échec et se relance au démarrage.
