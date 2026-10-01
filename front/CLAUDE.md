# Front — KYB Business

Application Next.js du parcours d'onboarding KYB. Contexte métier complet dans `../spec.md`, avancement global dans `../CLAUDE.md`.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript — lire `AGENTS.md` : APIs différentes des versions précédentes (params et `cookies()` asynchrones, `middleware` → `proxy`, types globaux `PageProps` / `LayoutProps`). Doc embarquée dans `node_modules/next/dist/docs/`.
- TanStack Query (données serveur, polling, mutations)
- `@kyb/shared` : types, schémas Zod (validation identique au back), libellés, listes Bridge
- CSS maison dans `src/app/globals.css` (Tailwind importé mais peu utilisé) : réutiliser les classes existantes (`content-section`, `field-card`, `form-grid`, `status-badge`…)

## Démarrage (depuis la racine du repo)

```powershell
npm run dev --workspace=back    # API sur :4000 (Mongo + MinIO locaux)
npm run dev --workspace=front   # front sur :3000
```

`API_URL` (côté serveur Next uniquement, défaut `http://localhost:4000`), voir `front/.env.example`. Pour tester sans coût : lancer le back avec `LLM_MODE=replay` et charger les PDF de `fixtures/fictif-demo/` (réponses LLM enregistrées). Config de lancement pour l'app desktop : `.claude/launch.json` (`back-replay`, `front`).

## Architecture

- **Le navigateur ne parle jamais directement à l'API.** Route Handlers Next : `src/app/api/applications/route.ts` (création : pose le jeton en cookie httpOnly `kyb_<applicationId>`, 30 jours, jamais exposé au JavaScript) et `src/app/api/applications/[id]/[[...path]]/route.ts` (relais générique vers `/v1/applications/{id}/…`, ajoute `Authorization: Bearer` depuis le cookie, corps transmis en flux, y compris l'upload multipart). `src/lib/server/backend.ts` est `server-only`.
- `src/lib/api.ts` : client du navigateur (`ApiRequestError` avec `code` et `fields` renvoyés par l'API ; upload en XHR pour la progression réseau, un fichier par requête).
- `src/lib/queries.ts` : `useApplication` (polling 2 s tant que `processing_documents > 0`), mutations documents et personnes ; les routes d'écriture renvoient le dossier complet, remis en cache (`setQueryData`).
- `src/lib/autosave.ts` : autosave debounce 800 ms, modifications regroupées par cible, envoi immédiat au démontage ; erreurs de champ mappées depuis `details.fields`. Toutes les écritures utilisent `mutationKey: ["save", id]` → indicateur « Enregistrement… » de `AppShell`.
- `src/components/fields/FieldCard.tsx` : champ avec valeur, source (« Extrait de … , p. N · %»), badges « À vérifier » (< 0,8) / « Conflit » / « À compléter », choix entre candidats en cas de conflit, validation par le schéma partagé. **N'enregistre que si la valeur a changé** (sinon un simple passage dans un champ extrait le marquerait `edited_by_user`). Se resynchronise avec le serveur hors saisie (ex. téléphone normalisé en E.164). Bouton « Revenir à la valeur des documents » sur un champ extrait modifié (`onRevert` → `revert` de `useBusinessAutosave` / `useUboAutosave`, qui retire d'abord la saisie encore en attente du lot d'autosave). Affiche « Déduit — … » quand `derived_reason` est présent.
- `src/components/layout/DossierShell.tsx` : charge le dossier pour toutes les pages `/dossier/[id]/…`, fournit `useDossier()`, gère le dossier inaccessible (401/404), mémorise le dernier dossier en `localStorage` (identifiant seul, pour « Reprendre » sur l'accueil).
- Pages : `/` (démarrer / reprendre), `/dossier/[id]/documents` (upload, statuts, confirmation de type, suppression), `/verifier` (champs de l'entreprise, personnes : correction, ajout, retrait, pièce rattachée, signataire de l'attestation), `/completer` (champs client), `/recap` (pièces par section Bridge, personnes, alertes ; soumission désactivée jusqu'au moteur de règles).

## Test de bout en bout (Playwright)

`npm run test:e2e` (racine ou `--workspace=front`) : `front/e2e/parcours.spec.ts` rejoue le parcours heureux (création, upload des 3 PDF de `fixtures/fictif-demo`, polling jusqu'à « Prêt », conflit choisi puis rétabli, personnes, validation et autosave de Compléter vérifiés après rechargement, récap) et le cas du dossier inaccessible. `playwright.config.ts` démarre lui-même un environnement isolé : API sur :4100 en `LLM_MODE=replay` (base `kyb_e2e`, bucket `kyb-e2e`, vidés par `e2e/global-setup.ts`) et front en build de production sur :3100 dans `.next-e2e` (`NEXT_DIST_DIR` dans `next.config.ts`, pour ne pas gêner un `next dev`). Prérequis : Mongo et MinIO démarrés, `back/.env` renseigné. Navigateur : Edge installé en local (`channel: msedge`), Chromium de Playwright en CI (`npx playwright install chromium`). ~2 min au premier lancement (build), ~1 min ensuite.

## Pas encore fait

- Lien « reprendre plus tard » (le jeton n'existe que dans le cookie du navigateur qui a créé le dossier).
- Aperçu du document source (route `/preview` absente côté API).
- `GET /status` (pièces manquantes, `ready`) et soumission : dépendent du moteur de règles (J4). Le compteur « informations restantes » de `/completer` est indicatif.
- Suggestion NAICS, description générée (J4).

## Important

@AGENTS.md
