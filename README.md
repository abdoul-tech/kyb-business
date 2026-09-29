# KYB Business

Projet de self-onboarding KYB : le client charge ses documents, les données sont extraites et vérifiées, puis un dossier prêt pour Bridge est préparé. Le périmètre fonctionnel et les règles métier de référence sont décrits dans [spec.md](spec.md).

## État actuel

> **Le J2 est terminé côté code.** Upload, stockage chiffré, file asynchrone, classification et extraction LLM (RCCM, statuts, pièce d'identité) fonctionnent de bout en bout, et `npm run eval` mesure la qualité. **Le premier score (100 %) porte uniquement sur 3 documents fictifs** générés proprement : il valide l'outil, pas la qualité réelle. **Il manque des documents réels anonymisés** (idéalement les 4 dossiers du Guide) avec leurs valeurs attendues pour mesurer le critère « 80 % des champs » de la spec.

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
- **Confirmation du type** : `PATCH /v1/applications/:id/documents/:docId` avec `{ "type": "rccm" }` relance l'extraction avec ce type, sans reclassification (`409 DOCUMENT_PROCESSING` pendant un traitement). Un dossier `submitted` est en lecture seule (`409 APPLICATION_LOCKED`).

### Classification et extraction par IA (J2)

- **Rendu** : une image PNG par page (200 DPI, plafonnée à 4000 px) et le texte embarqué du PDF, envoyé comme simple indice.
- **Client LLM unique** (OpenAI, Chat Completions) : `store: false`, température 0, réponse en Structured Outputs stricts générés depuis les schémas Zod, 5 appels simultanés maximum, timeout 60 s et 2 nouveaux essais. Tokens, coût et durée enregistrés par document (`llm_usage`).
- **Modes** `live` / `record` / `replay` : les tests et le smoke test rejouent les réponses de `fixtures/llm/` et n'appellent jamais OpenAI (`LLM_MODE=replay` forcé par `vitest.config.ts`).
- **Classification** sur les 3 premières pages en basse résolution ; sous 0,7 de confiance, le client confirme le type.
- **Extraction** RCCM, statuts et pièce d'identité (les autres types arrivent au J4) : toutes les pages en haute définition, un seul nouvel essai avec les erreurs de validation, puis échec explicite. La forme juridique n'est jamais déduite d'un sigle accolé au nom (cas SAIDOU AUTO), les dates « 01/01 » ne sont jamais corrigées.
- **Résultats chiffrés en base** (AES-256-GCM) et renvoyés déchiffrés par `GET /v1/applications/:id/documents/:docId`.
- **Modèles par défaut** : `gpt-4.1-mini` (classification), `gpt-4.1` (extraction). Coût mesuré sur les documents fictifs : environ 0,01 USD et 5 à 9 s par document (cible de la spec : 0,15 USD et 30 s).

### Évaluation (J2)

`npm run eval` classe et extrait chaque document de `fixtures/<dossier>/` (et `fixtures/private/<dossier>/`, ignoré par git) et compare aux valeurs de `expected.json` : classification, champs corrects (objectif ≥ 80 %), faux positifs, et erreurs à confiance ≥ 0,8 (non signalées au client). Format et options : [fixtures/README.md](fixtures/README.md).

Premier score, sur les 3 documents fictifs de `fixtures/fictif-demo` : classification 3/3, champs corrects 41/41, faux positifs 0/8, pour 0,035 USD. Ce score n'est pas représentatif : documents générés, sans scan, tampon ni écriture manuscrite.

## Avancement

| Jalon | État | Reste à faire |
| --- | --- | --- |
| J1 | Presque terminé | Validation des schémas et liste des activités réglementées par le DRI ; Docker Compose complet |
| J2 | Terminé côté code | Score d'évaluation sur des documents réels anonymisés |
| J3 | Non commencé | Fusion des champs, rapprochement UBO, écrans vérifier / compléter, champs client, autosave |
| J4 à J5 | Non commencés | Voir `spec.md` |

Le front n'est pas encore branché à l'API : il affiche un parcours avec des données factices (prévu au J3).

## Prérequis

- Node.js 22 ou supérieur
- npm fourni avec Node.js
- MongoDB en local sur `localhost:27017`
- MinIO en local sur `localhost:9000` (console sur `9001`). Le bucket `kyb-documents` est créé automatiquement au démarrage de l'API s'il n'existe pas. Exemple de lancement sous Windows :

```powershell
C:\minio\minio.exe server C:\minio\data --console-address :9001
```

- Une clé OpenAI (`OPENAI_API_KEY` dans `back/.env`) pour faire tourner l'API ou `npm run eval` en réel. Sans clé, utiliser `LLM_MODE=replay`. `npm run llm:check --workspace=back` vérifie la clé, les modèles et la vision en un appel (< 0,001 USD).

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
npm run eval                           # évaluation classification + extraction (LLM réel)
npm run eval -- --mode=replay          # même chose sans clé ni coût, sur les réponses enregistrées
npm run build --workspace=@kyb/shared
npm run build --workspace=back
npm run build --workspace=front
```

Le smoke test utilise une base (`kyb_smoke`) et un bucket (`kyb-smoke`) dédiés, vidés à la fin. Il vérifie notamment que le fichier stocké dans MinIO est bien chiffré, que les doublons, fichiers invalides, trop lourds ou trop longs sont traités comme le prévoit la spec, que les documents fictifs passent en arrière-plan de `uploaded` à `extracted` (LLM rejoué), que les champs extraits sont chiffrés en base, et que la confirmation du type et le verrouillage d'un dossier soumis fonctionnent.

Après une modification d'un prompt ou d'un schéma d'extraction, les réponses enregistrées ne correspondent plus : relancer `npm run llm:record-samples --workspace=back` (≈ 0,04 USD).

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
- Documents de test réels anonymisés (ou générés de façon réaliste) avec leurs valeurs attendues : sans eux, le critère « 80 % des champs » ne peut pas être mesuré.
- Les confiances renvoyées par le modèle sont très hautes (0,95 à 0,99) : le seuil « à vérifier » de 0,8 risque de se déclencher rarement. À vérifier sur documents réels (colonne « Err. ≥ 0,8 » de l'éval).
- Le code d'erreur `DOCUMENT_PROCESSING` (409) a été ajouté à la liste de la spec.

## Prochaines étapes

1. Logs pino avec `redact` et test sur la sortie des logs (critère d'acceptation de la spec).
2. J3 côté back : modèle de champ du dossier (`Field<T>`, candidats, `edited_by_user`), fusion multi-documents avec les priorités de la spec, rapprochement des UBO, `PATCH /v1/applications/:id` pour l'autosave.
3. J3 côté front : TanStack Query, routes `/dossier/[id]/...`, écrans vérifier / compléter branchés à l'API.
4. En parallèle, dès réception : score d'évaluation sur documents réels et ajustement des prompts.

## Usage de l’IA pendant le développement

L’IA a été utilisée pour analyser la spec et les exemples documentaires, préparer les workspaces npm, convertir le back en TypeScript, proposer les schémas Zod et leurs tests, écrire l'upload sécurisé, le stockage chiffré, la file de traitement asynchrone, le client LLM, les prompts de classification et d'extraction et l'outil d'évaluation avec leurs tests, générer les documents fictifs de test, et rédiger cette documentation. Les prompts ont été ajustés d'après des appels réels (ex. la forme juridique des statuts, d'abord recopiée avec toute la phrase de l'article). L'usage de l'IA dans le produit lui-même est décrit dans « Classification et extraction par IA ». Les tests du package partagé et les builds du package, du back et du front ont été exécutés localement. Les choix métier, les champs et les règles d’extraction restent à revoir et valider par le DRI.
