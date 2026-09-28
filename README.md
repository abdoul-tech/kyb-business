# KYB Business

Projet de self-onboarding KYB : le client charge ses documents, les données sont extraites et vérifiées, puis un dossier prêt pour Bridge est préparé. Le périmètre fonctionnel et les règles métier de référence sont décrits dans [spec.md](spec.md).

## État actuel

> **La suite du J2 est bloquée par l'obtention d'une clé OpenAI.** Le socle de l'API (dossiers, upload, stockage chiffré, file de traitement asynchrone) est terminé et testé. Tout ce qui reste au J2 (rendu PDF, classification, extraction RCCM / statuts / passeport, enregistrement des réponses pour le mode `replay`, `npm run eval`) nécessite une clé `OPENAI_API_KEY`, ainsi qu'un jeu de documents de test anonymisés avec les valeurs attendues. Qui fournit la clé et le budget d'évaluation reste une question ouverte de la spec.

### Fondation (J1)

- `front/` contient l’application Next.js avec App Router, React et TypeScript.
- `back/` contient l’API Express en TypeScript strict.
- `packages/shared/` est le package npm partagé `@kyb/shared`, configuré avec Zod et Vitest.
- Les schémas d’extraction couvrent les 11 types du registre de documents : `rccm`, `statuts`, `id_document`, `rccm_modificatif`, `tax_certificate`, `ownership_document`, `good_standing`, `proof_of_address`, `business_activity`, `license` et `logistics_document`.
- Les champs extraits portent leur valeur, leur confiance et leur page source. Les types TypeScript sont dérivés des schémas Zod.
- Le front transpile `@kyb/shared`; les deux applications construisent le package partagé avant leur démarrage en développement et leur build.
- Les tests du package partagé et les builds du package, du back et du front ont été vérifiés localement.

### API : dossiers, upload et stockage chiffré (J2)

- **Configuration** validée par Zod au démarrage (`back/src/config/env.ts`), lue depuis `back/.env`. En cas d'erreur, seul le nom de la variable est affiché, jamais sa valeur.
- **MongoDB** (driver natif) : collections `applications` et `documents`.
- **Jeton de dossier** : 32 octets aléatoires, stocké haché en SHA-256, envoyé en `Authorization: Bearer`.
- **Routes** : `POST /v1/applications`, `GET /v1/applications/:id`, `POST /v1/applications/:id/documents` (multipart, 1 à 10 fichiers, réponse `202`), `GET` et `DELETE /v1/applications/:id/documents/:docId`. Erreurs au format unique de la spec (`415 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`, `413 TOO_MANY_PAGES`, `401`, `404`…).
- **Contrôle des fichiers** : type détecté sur les octets (`file-type`) et non sur l'extension, PDF / JPG / PNG uniquement, 15 Mo et 30 pages maximum (pages comptées avec `pdfjs-dist`), PDF corrompu ou protégé refusé avec un message clair. Un envoi est accepté ou refusé en bloc : aucun fichier n'est stocké si l'un d'eux est invalide.
- **Doublons** : hash SHA-256 unique par dossier (index Mongo). Un fichier déjà chargé renvoie le document existant, y compris en cas d'envois simultanés.
- **Stockage chiffré** : chiffrement applicatif AES-256-GCM (`FILE_ENCRYPTION_KEY`) puis envoi sur MinIO sous la clé `applications/{application_id}/{document_id}`. Les fichiers ne sont jamais écrits en clair sur disque. La suppression d'un document supprime aussi l'objet MinIO.

### Traitement asynchrone des documents (J2)

- **File en mémoire** (`p-queue`, 3 traitements en parallèle) : l'upload répond immédiatement, le traitement se fait en arrière-plan et le client suit l'avancement par polling du dossier.
- **Statuts** : `uploaded` → `classifying` → `extracting` → `extracted`, ou `needs_type_confirmation` (confiance < 0,7 ou type inconnu), ou `failed` avec un `error_code`. Chaque transition est conditionnelle : un document supprimé ou modifié pendant son traitement n'est jamais écrasé.
- **Un même document n'est jamais traité deux fois en parallèle** ; s'il est remis en file pendant son traitement, il est relancé juste après.
- **Reprise au démarrage** : les documents restés en `uploaded`, `classifying` ou `extracting` sont relancés, en reprenant à l'étape où ils s'étaient arrêtés.
- **Logs** limités à l'id du document, l'étape et le code d'erreur : aucun contenu de document ni message d'erreur (vérifié par un test).
- La classification et l'extraction sont branchables (`back/src/documents/processing.ts`). **En attendant la clé OpenAI**, la classification répond « type inconnu » : tous les documents finissent en `needs_type_confirmation`. Ils ne sont jamais marqués `extracted` sans extraction réelle.

## Avancement

| Jalon | État | Reste à faire |
| --- | --- | --- |
| J1 | Presque terminé | Validation des schémas et liste des activités réglementées par le DRI ; Docker Compose complet |
| J2 | Environ 45 % | **Bloqué par la clé OpenAI** : rendu PDF en images, client LLM (modes `live` / `replay` / `record`), registre des types, classification, extraction RCCM / statuts / passeport, chiffrement des sorties d'extraction, `fixtures/` et `npm run eval` |
| J3 à J5 | Non commencés | Voir `spec.md` |

Le front n'est pas encore branché à l'API : il affiche un parcours avec des données factices (prévu au J3).

## Prérequis

- Node.js 22 ou supérieur
- npm fourni avec Node.js
- MongoDB en local sur `localhost:27017`
- MinIO en local sur `localhost:9000` (console sur `9001`). Le bucket `kyb-documents` est créé automatiquement au démarrage de l'API s'il n'existe pas. Exemple de lancement sous Windows :

```powershell
C:\minio\minio.exe server C:\minio\data --console-address :9001
```

## Installation et démarrage local

Depuis la racine du dépôt :

```powershell
npm ci
```

Copier `back/.env.example` en `back/.env` puis renseigner les identifiants MinIO et une clé de chiffrement (32 octets en base64) :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`back/.env` est ignoré par git. **Conserver la clé de chiffrement** : sans elle, les fichiers déjà stockés sont illisibles.

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
npm test --workspace=back              # tests unitaires, sans Mongo ni MinIO
npm run test:smoke --workspace=back    # parcours API de bout en bout sur Mongo et MinIO locaux
npm run build --workspace=@kyb/shared
npm run build --workspace=back
npm run build --workspace=front
```

Le smoke test utilise une base (`kyb_smoke`) et un bucket (`kyb-smoke`) dédiés, vidés à la fin. Il vérifie notamment que le fichier stocké dans MinIO est bien chiffré, que les doublons, fichiers invalides, trop lourds ou trop longs sont traités comme le prévoit la spec, et que les documents passent en arrière-plan de `uploaded` à `needs_type_confirmation`.

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
- Qui fournit la clé OpenAI et le budget de l'évaluation.

## Prochaines étapes

**Prérequis bloquant : obtenir une clé OpenAI** (et le budget d'évaluation associé), ainsi que des documents de test anonymisés (au moins un RCCM, des statuts et un passeport) avec les valeurs attendues.

1. Rendu PDF en images et texte embarqué (`pdfjs-dist` + `@napi-rs/canvas`).
2. Client LLM unique : timeout, nouveaux essais, `store: false`, modes `live` / `replay` / `record` pour que les tests n'appellent jamais le vrai LLM.
3. Registre des types de document, classification, puis extraction RCCM / statuts / passeport en Structured Outputs, avec validation Zod et normalisation.
4. `PATCH /v1/applications/:id/documents/:docId` pour que le client confirme le type d'un document en `needs_type_confirmation`.
5. `fixtures/` et `npm run eval` : premier score d'évaluation, livrable du J2.
6. Hors dépendance OpenAI, en parallèle : logs pino avec `redact`, Docker Compose complet, validation des schémas par le DRI.

## Usage de l’IA pendant le développement

L’IA a été utilisée pour analyser la spec et les exemples documentaires, préparer les workspaces npm, convertir le back en TypeScript, proposer les schémas Zod et leurs tests, écrire l'upload sécurisé, le stockage chiffré et la file de traitement asynchrone avec leurs tests, et rédiger cette documentation. Les tests du package partagé et les builds du package, du back et du front ont été exécutés localement. Les choix métier, les champs et les règles d’extraction restent à revoir et valider par le DRI.
