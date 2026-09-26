# KYB Business

Projet de self-onboarding KYB : le client charge ses documents, les données sont extraites et vérifiées, puis un dossier prêt pour Bridge est préparé. Le périmètre fonctionnel et les règles métier de référence sont décrits dans [spec.md](spec.md).

## État actuel

La fondation du dépôt et la première série de schémas sont en place :

- `front/` contient l’application Next.js avec App Router, React et TypeScript.
- `back/` contient l’API Express en TypeScript strict.
- `packages/shared/` est le package npm partagé `@kyb/shared`, configuré avec Zod et Vitest.
- Les schémas d’extraction couvrent les 11 types du registre de documents : `rccm`, `statuts`, `id_document`, `rccm_modificatif`, `tax_certificate`, `ownership_document`, `good_standing`, `proof_of_address`, `business_activity`, `license` et `logistics_document`.
- Les champs extraits portent leur valeur, leur confiance et leur page source. Les types TypeScript sont dérivés des schémas Zod.
- Le front transpile `@kyb/shared`; les deux applications construisent le package partagé avant leur démarrage en développement et leur build.
- Les tests du package partagé et les builds du package, du back et du front ont été vérifiés localement.

Les schémas ne sont pas encore branchés au pipeline d’extraction, aux routes API ni aux formulaires du front. Le front affiche encore le squelette Next.js et l’API expose uniquement `/health`. MongoDB, MinIO et le traitement LLM ne sont pas encore intégrés.

## Avancement J1

Le J1 est **partiellement réalisé** : la structure npm en workspaces, le squelette démarrable localement et les schémas Zod initiaux sont présents. La clôture du jalon dépend encore de la validation métier des schémas par le DRI, de la liste des activités réglementées et de la mise à niveau de Docker Compose pour démarrer le projet complet.

## Prérequis

- Node.js 22 ou supérieur
- npm fourni avec Node.js

## Installation et démarrage local

Depuis la racine du dépôt :

```powershell
npm ci
```

Lancer chaque application dans son propre terminal :

```powershell
npm run dev --workspace=back
```

```powershell
npm run dev --workspace=front
```

Le front est disponible sur [http://localhost:3000](http://localhost:3000). L’API écoute sur le port `4000`; son endpoint de santé est [http://localhost:4000/health](http://localhost:4000/health).

## Commandes de vérification

```powershell
npm test --workspace=@kyb/shared
npm run build --workspace=@kyb/shared
npm run build --workspace=back
npm run build --workspace=front
```

Le build du back utilise TypeScript avec `strict: true`. Pour démarrer le build compilé du back :

```powershell
npm run start --workspace=back
```

## Architecture des packages

```text
front/                 Application web Next.js
back/                  API Express en TypeScript
packages/shared/       Schémas et types partagés
```

Le package partagé est exposé sous le nom `@kyb/shared`. Les applications peuvent l’importer avec ce nom; ses sources TypeScript sont compilées dans `packages/shared/dist/` avant leur démarrage ou leur build.

## Docker

Le démarrage local documenté ci-dessus ne nécessite pas Docker. La configuration Docker existante est à mettre à jour avant usage : elle ne lance pas encore l’ensemble web, API, MongoDB et MinIO décrit dans la spec, et le Dockerfile du back référence encore l’ancien point d’entrée JavaScript. Ne pas considérer le démarrage Docker complet comme validé.

## Points à valider

- Le DRI doit valider les champs extraits et fournir la liste des activités réglementées ainsi que les références légales par pays.
- Les règles de fusion doivent préciser la priorité des nouvelles formes juridiques et des capitaux extraits d’un `rccm_modificatif`; cette priorité n’est pas encore définie dans la spec.
- La règle de preuve d’activité devra rapprocher les parties d’une facture ou d’un contrat de l’entreprise du dossier, afin de confirmer son rôle plutôt que de se fier uniquement au rôle extrait.
- Docker Compose et le Dockerfile du back doivent être adaptés aux workspaces et à l’entrée TypeScript.

## Prochaines étapes

1. Faire valider les schémas et la liste des activités réglementées par le DRI.
2. Ajouter le registre des types de documents et les schémas partagés du dossier et des échanges API.
3. Intégrer les schémas au pipeline d’extraction, à l’API et au formulaire.
4. Configurer MongoDB et MinIO pour l’environnement local.
5. Adapter Docker Compose et les Dockerfiles aux workspaces et à TypeScript.
6. Construire progressivement les règles métier et le parcours décrits dans `spec.md`.

## Usage de l’IA pendant le développement

L’IA a été utilisée pour analyser la spec et les exemples documentaires, préparer les workspaces npm, convertir le back en TypeScript, proposer les schémas Zod et leurs tests, et rédiger cette documentation. Les tests du package partagé et les builds du package, du back et du front ont été exécutés localement. Les choix métier, les champs et les règles d’extraction restent à revoir et valider par le DRI.
