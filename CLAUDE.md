# KYB Business — guide pour Claude Code

Lire `spec.md` avant toute décision métier : c'est la source de vérité (parcours, règles KYB, modèle de données, API, jalons). Ce fichier résume la stack et l'état d'avancement réel pour éviter de relire toute la spec à chaque session.

## Projet

Self-onboarding KYB assisté par IA : le client dépose ses documents, l'IA en extrait les champs, le client ne complète que ce qui manque, puis le dossier est exporté au format Bridge. Projet autonome (pas de dépendance au monorepo Sako), mais le code doit rester réintégrable dans `api/` Sako (même stack Node/TypeScript). Sert aussi de projet d'onboarding pour un nouvel ingénieur (IC), avec `@Abdoul` en DRI.

## Structure du repo (réelle, différente du layout `apps/` de la spec)

```
front/                 Next.js (App Router) — voir front/AGENTS.md (breaking changes Next.js, généré par next dev)
back/                  API Express, TypeScript, ESM ("type": "module")
packages/shared/       @kyb/shared — schémas Zod + types partagés, buildés en dist/ avant usage
spec.md                Spec fonctionnelle et technique de référence
```

Workspaces npm (`package.json` racine) : `front`, `back`, `packages/shared`.

## Stack imposée par la spec

| Couche | Choix |
| --- | --- |
| Front | Next.js App Router, TypeScript, TanStack Query |
| API | Node 22+, TypeScript strict, Express |
| Validation | Zod, partagé via `packages/shared` |
| DB | MongoDB |
| Fichiers | S3-compatible (MinIO en local) |
| LLM | OpenAI (vision + PDF rendu en images), modèles configurables par usage |
| Rendu PDF | `pdfjs-dist` + `@napi-rs/canvas` |
| File async | En mémoire (`p-queue`, concurrence 3) au départ |
| Tests | Vitest + Supertest, Playwright pour le front |
| Logs | pino avec `redact` (aucune donnée d'identité) |

## État d'avancement réel (à vérifier avant de supposer qu'une brique existe)

- `packages/shared` : schémas Zod pour les 11 types de documents (`rccm`, `statuts`, `id_document`, `rccm_modificatif`, `tax_certificate`, `ownership_document`, `good_standing`, `proof_of_address`, `business_activity`, `license`, `logistics_document`), avec `extractedField` (`value`/`confidence`/`source_page`). Testé (Vitest).
- `back/` (J2 étape 1 faite) : env validé par Zod (`config/env.ts`, lit `back/.env`), MongoDB (driver natif), jeton de dossier haché. Routes `POST /v1/applications`, `GET /:id`, `POST|GET|DELETE /:id/documents[/:docId]`. Upload : type détecté sur les octets (`file-type`), 15 Mo / 30 pages (`pdfjs-dist`), hash SHA-256 unique par dossier, envoi refusé en bloc si un fichier est invalide, chiffrement AES-256-GCM puis MinIO (`documents/storage.ts`, clé `applications/{id}/{docId}`). File async (J2 étape 2 faite) : `documents/queue.ts` (p-queue, concurrence 3, jamais deux traitements du même document en parallèle), `documents/pipeline.ts` (transitions conditionnelles `uploaded` → `classifying` → `extracting` → `extracted` | `needs_type_confirmation` (< 0,7 ou `unknown`) | `failed`, reprise au démarrage), branchement dans `documents/processing.ts`. Classification et extraction réelles branchées (J2 étape 4) : `documents/classifier.ts` (3 premières pages, 100 DPI, `detail: low`, les 12 types), `documents/extractor.ts` (toutes les pages à `PDF_RENDER_DPI`, `detail: high`, texte embarqué en indice, un seul nouvel essai avec les erreurs Zod puis `EXTRACTION_INVALID`), `documents/normalize.ts` (trim, vide → null, dates non ISO vidées). Registre `documents/types/` : RCCM, statuts, pièce d'identité uniquement (autres types → `failed` / `EXTRACTION_NOT_SUPPORTED` jusqu'au J4). Prompts dans `documents/types/*.ts` + `prompts.ts`. Schéma JSON strict généré depuis Zod par `llm/json-schema.ts`. `documentTypeCatalog` (libellés + sections Bridge) et `isIsoDate` / `formatDisplayDate` dans `@kyb/shared`. Chaque document garde `llm_usage` (tokens, coût, durée), y compris pour les appels d'une extraction échouée.
- Sorties d'extraction chiffrées (J2 étape 5) : champ Mongo `extracted_data_enc` (AES-256-GCM, même clé `FILE_ENCRYPTION_KEY`), conversion clair ↔ chiffré dans `db/document-patch.ts` ; le pipeline manipule `extracted_data` en clair. `GET /documents/:docId` renvoie `StoredDocumentDetail` (champs déchiffrés) ; `GET /:id` ne les renvoie pas (fusion au J3).
- Confirmation du type (J2 étape 6) : `PATCH /documents/:docId` `{ type }` (`ConfirmDocumentTypeRequestSchema`, `unknown` refusé) depuis `needs_type_confirmation` / `extracted` / `failed` → `extracting`, `type_confirmed_by_user: true`, réextraction sans reclassification. `409 DOCUMENT_PROCESSING` (code ajouté à la liste de la spec) si le document est en cours de traitement. `requireEditableApplication` : upload, PATCH et DELETE renvoient `409 APPLICATION_LOCKED` sur un dossier `submitted`.
- Documents fictifs (RCCM « BARRY AUTO SARL » sans forme juridique explicite, statuts, passeport spécimen) dans `back/tests/helpers/samples.ts`, réponses enregistrées dans `fixtures/llm/` par `npm run llm:record-samples --workspace=back` (≈ 0,04 USD), rejouées par `tests/samples.test.ts` et le smoke test. **Tout changement de prompt ou de schéma invalide ces enregistrements : relancer le script.**
- Rendu et LLM : `documents/renderer.ts` (PNG par page à `PDF_RENDER_DPI` + texte embarqué, pdfjs + @napi-rs/canvas) ; `llm/client.ts` (Chat Completions, `store:false`, temperature 0 hors génération, Structured Outputs strict, sémaphore 5, usage + coût par appel via `llm/pricing.ts`) ; transport OpenAI dans `llm/openai-transport.ts` (timeout 60 s, 2 nouveaux essais gérés par le SDK) ; client configuré dans `llm/index.ts`. Modes `live` / `record` / `replay` : fixtures dans `fixtures/llm/<purpose>/<hash>.json`, hash indépendant des octets d'image (`replayKey` = hash du fichier + pages). `vitest.config.ts` force `LLM_MODE=replay`. Modèles par défaut : `gpt-4.1-mini` (classify), `gpt-4.1` (extract, generate). `npm run llm:check --workspace=back` vérifie clé + modèles + vision (1 appel, < 0,001 USD).- Mongo et MinIO tournent en local (pas de Docker) ; MinIO dans `C:\minio` : `minio.exe server C:\minio\data --license C:\minio\minio.license --console-address :9001`. Tests : `npm test --workspace=back` (unitaires) et `npm run test:smoke --workspace=back` (bout en bout sur Mongo/MinIO locaux, base et bucket jetables).
- `front/src/app` : pages `documents`, `verify`, `complete`, `summary` avec données mock (`lib/mock-data.ts`) et contexte React (`context/OnboardingContext.tsx`) — pas encore branché à l'API. Pas de TanStack Query installé. Pas de routes dynamiques `/dossier/[id]/...`.
- Pas de Docker Compose fonctionnel pour l'ensemble web/api/mongo/minio (le README l'indique explicitement comme non fiable).
- Évaluation (J2) : `npm run eval` (racine) → `back/scripts/eval.ts` ; code dans `back/src/eval/` (`dataset.ts` : `fixtures/<dossier>/expected.json` et `fixtures/private/<dossier>/` ignoré par git ; `scoring.ts` : chemins `officers[0].last_name`, `null` = doit rester vide, comparaison insensible à la casse/espaces mais pas aux accents ; `run.ts` : classification puis extraction avec le type attendu ; `report.ts`). Options `--mode=live|record|replay` (record interdit sur `private/`), `--dossier=`. Rapport JSON dans `eval-results/` (ignoré par git). Format documenté dans `fixtures/README.md`. Seul dossier : `fixtures/fictif-demo` (PDF identiques octet pour octet à `samples.ts`, vérifié par `tests/eval.test.ts` ; `.gitattributes` marque les PDF en binaire). Premier score : 100 % sur ces 3 documents fictifs, non représentatif.
- Logs pino (`back/src/logger.ts`) : JSON, `redact` sur une liste de clés sensibles (racine + 2 niveaux), erreurs sérialisées sans leur message (`serializeError` : type, code, pile). Une ligne par requête HTTP (`http/middleware/request-log.ts` : méthode, chemin sans query, statut, durée ; jamais d'en-têtes ni de corps). Pipeline via `documents/pipeline-logger.ts`. Règle : ne logger que des identifiants, types, statuts, codes et durées ; jamais `console.*` dans `src/` (les scripts CLI peuvent). Critère de la spec vérifié par `tests/logging.test.ts` (sortie pino capturée). `LOG_LEVEL` dans `.env`.
- Fusion et UBO (J3 back) : **la fusion n'est pas stockée**, elle est recalculée à chaque `GET /applications/:id` (`application/view.ts`) depuis les extractions déchiffrées des documents `extracted` + les saisies client stockées dans `applications.user_business` (`{ value, edited_at }` par champ). Supprimer un document retire donc ses candidats ; une saisie client gagne toujours (`userField`, `edited_by_user: true`, candidats extraits conservés). `application/fields.ts` : `resolveField` (priorité de source → confiance → plus récent ; conflit si candidats différents après `foldText` → confiance plafonnée 0,5, `conflict: true`, alerte `field_conflict`). `application/merge.ts` : `BUSINESS_PRIORITY` (table de la spec), `entity_type` déduit de `legal_form_local` via `mapLegalForm` (Annexe A, shared) ; l'objet social des statuts n'est qu'un repli de `activity` (pas de conflit avec le RCCM) ; adresses comparées sur `full_address`. `application/ubo-matching.ts` : mentions (associés + gérants des statuts, dirigeants RCCM, pièces d'identité, `ownership_document`), regroupées si Jaro-Winkler ≥ 0,92 sur `normalizeName` et dates de naissance compatibles ; 0,85–0,92 ou dates différentes → alerte `ubo_possible_duplicate` ; % calculé depuis les parts ; `rules/ownership.ts` (seuil 25 %, rôles de direction). Id UBO = hash salé (HMAC de `FILE_ENCRYPTION_KEY` + id du dossier, `uboIdSalt` dans `view.ts`) du nom de la première mention (statuts > ownership > rccm > id) : stable, mais pas devinable à partir d'un nom (il apparaît dans les URL et les logs). Routes `/v1/applications/:id/ubos` (`http/routes/ubos.ts`) : les actions du client sont stockées dans `applications.user_ubos` (`overrides[uboId].values` / `.removed`, `manual[ubo_m_…]`, `attesting_ubo_id`) et appliquées par `application/user-ubos.ts` après le rapprochement. POST ajoute (nom obligatoire) → `{ ubo_id, application }` ; PATCH corrige (null = vider), rattache `id_document_id` (document `id_document` du dossier, expiration lue sur son extraction), `attests_ownership: true` réservé à un control person (un seul signataire) ; DELETE supprime une personne ajoutée, masque une personne détectée. `is_ubo` / `is_control_person` recalculés sur les valeurs finales. Une personne ajoutée au nom proche d'une personne détectée → `ubo_possible_duplicate`. `PATCH /applications/:id` (`ApplicationPatchSchema` dans shared, valeurs brutes, null = vidé, téléphone normalisé E.164 via `normalizePhone`), erreurs 400 sans les valeurs saisies. Types `Field<T>`, `BusinessView`, `UboView`, `ApplicationView`, listes Bridge (Annexe B) dans `@kyb/shared`.
- **Point ouvert (à trancher par le DRI)** : Jaro-Winkler ≥ 0,92 sur le nom entier fusionne « Awa DIOP » / « Awa DIOUF » (0,93), « Moussa KANE » / « KONE » (0,945), et ne rapproche pas « Paul Wendkouni OUEDRAOGO » / « Paul OUEDRAOGO » (0,917). Implémenté tel que la spec le décrit.
- Pas encore : moteur de règles, `/status`, génération (description, NAICS, exemption, attestation), export Bridge. `rccm_modificatif` n'alimente pas encore la fusion.

Concrètement : J1 fait (hors docker compose complet et validation DRI). J2 fait côté code ; le score sur documents réels anonymisés reste à obtenir (aucun document réel fourni). J3 : back fait (fusion, rapprochement UBO, autosave, routes UBO) ; front à faire. Ne pas supposer que le moteur de règles existe — il est à construire (J4).

## Commandes

```powershell
npm ci                                   # depuis la racine
npm run dev --workspace=back             # API sur :4000 (/health)
npm run dev --workspace=front            # front sur :3000
npm test --workspace=@kyb/shared
npm run build --workspace=@kyb/shared
npm run build --workspace=back
npm run build --workspace=front
```

`front` et `back` reconstruisent `@kyb/shared` avant `dev`/`build` (`predev`/`prebuild`).

## Points d'attention métier (extraits de la spec, à ne pas casser)

- Une section Bridge = un document, sauf les statuts qui couvrent Formation + Ownership.
- `legal_form_explicit` vient uniquement de la mention explicite « Forme juridique », jamais d'un sigle accolé au nom (cas SAIDOU AUTO).
- Une valeur modifiée par le client (`edited_by_user: true`) n'est jamais écrasée par une extraction ultérieure.
- Dates stockées en ISO, affichées/exportées en `JJ/MM/AAAA` ; un « 01/01 » n'est jamais "corrigé".
- Aucune donnée d'identité dans les logs.
- `LLM_MODE=replay` : tests et CI ne doivent jamais appeler le vrai LLM.

## Hors périmètre (ne pas implémenter sans validation du DRI)

Soumission directe via l'API Bridge, section EEA, KYC individuel (liveness), back-office interne, multilingue au-delà du français, comptes utilisateur/email de reprise, antivirus sur les fichiers.
