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
- `back/` (J2 étape 1 faite) : env validé par Zod (`config/env.ts`, lit `back/.env`), MongoDB (driver natif), jeton de dossier haché. Routes `POST /v1/applications`, `GET /:id`, `POST|GET|DELETE /:id/documents[/:docId]`. Upload : type détecté sur les octets (`file-type`), 15 Mo / 30 pages (`pdfjs-dist`), hash SHA-256 unique par dossier, envoi refusé en bloc si un fichier est invalide, chiffrement AES-256-GCM puis MinIO (`documents/storage.ts`, clé `applications/{id}/{docId}`). File async (J2 étape 2 faite) : `documents/queue.ts` (p-queue, concurrence 3, jamais deux traitements du même document en parallèle), `documents/pipeline.ts` (transitions conditionnelles `uploaded` → `classifying` → `extracting` → `extracted` | `needs_type_confirmation` (< 0,7 ou `unknown`) | `failed`, reprise au démarrage), branchement dans `documents/processing.ts`. Classification et extraction y sont encore des bouchons (type `unknown` → `needs_type_confirmation`) : pas encore de rendu PDF, LLM, registre de types, ni pino.
- Mongo et MinIO tournent en local (pas de Docker) ; MinIO dans `C:\minio` : `minio.exe server C:\minio\data --license C:\minio\minio.license --console-address :9001`. Tests : `npm test --workspace=back` (unitaires) et `npm run test:smoke --workspace=back` (bout en bout sur Mongo/MinIO locaux, base et bucket jetables).
- `front/src/app` : pages `documents`, `verify`, `complete`, `summary` avec données mock (`lib/mock-data.ts`) et contexte React (`context/OnboardingContext.tsx`) — pas encore branché à l'API. Pas de TanStack Query installé. Pas de routes dynamiques `/dossier/[id]/...`.
- Pas de Docker Compose fonctionnel pour l'ensemble web/api/mongo/minio (le README l'indique explicitement comme non fiable).
- Pas de registre de types de document (`DocumentTypeDefinition`) côté back, pas de moteur de règles, pas de pipeline d'extraction, pas d'export Bridge.

Concrètement : J1 fait (hors docker compose complet), J2 en cours (upload, stockage chiffré et file async faits ; rendu PDF, LLM, classification, extraction et eval à construire). Ne pas supposer que la fusion de champs, le rapprochement UBO, les règles métier ou l'extraction LLM existent quelque part — ils sont à construire.

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
