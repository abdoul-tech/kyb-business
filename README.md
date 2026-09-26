# KYB Business

Projet de self-onboarding KYB : le client charge ses documents, les données sont extraites et vérifiées, puis un dossier prêt pour Bridge est préparé. Le périmètre fonctionnel et les règles métier de référence sont décrits dans [spec.md](spec.md).

## État actuel

La fondation du dépôt est en place :

- `front/` contient l’application Next.js avec App Router, React et TypeScript.
- `back/` contient l’API Express, convertie en TypeScript strict.
- `packages/shared/` est le package partagé des workspaces npm. Il contient Zod et un premier schéma générique de champ extrait (`value`, `confidence`, `source_page`).
- Le front est configuré pour transpiler `@kyb/shared`; les deux applications construisent le package partagé avant leur build et leur mode de développement.
- Un lockfile npm unique se trouve à la racine.

Cette étape ne comprend pas encore les schémas métier détaillés par type de document, les routes KYB, MongoDB, MinIO, l’extraction LLM, ni les écrans du parcours. Le front affiche encore le squelette Next.js et l’API expose uniquement `/health`.

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

## Prochaines étapes

1. Définir et valider avec le DRI les schémas Zod RCCM, statuts et pièce d’identité dans `packages/shared/`.
2. Importer ces schémas depuis le code du front et de l’API et ajouter des tests ciblés.
3. Configurer MongoDB et MinIO pour l’environnement local.
4. Adapter Docker Compose et les Dockerfiles à la structure en workspaces.
5. Construire progressivement le pipeline d’upload, d’extraction et de validation métier décrit dans `spec.md`.

## Usage de l’IA pendant le développement

L’IA a été utilisée pour analyser la spec, établir les étapes d’architecture, préparer la configuration initiale des workspaces npm et du package Zod partagé, convertir le point d’entrée de l’API en TypeScript, et rédiger cette documentation. Les builds du package partagé, du back et du front ainsi que l’endpoint `/health` ont été vérifiés localement. Les décisions métier et les schémas détaillés doivent encore être revus et validés par le DRI.
