# Front — KYB Business

Application Next.js du parcours d'onboarding KYB. Contexte métier complet dans `../spec.md`, avancement global dans `../CLAUDE.md`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- ESLint (`eslint-config-next`)
- `@kyb/shared` (workspace `packages/shared`) pour les schémas/types Zod partagés avec le back
- TanStack Query est prévu par la spec pour la gestion des données serveur (polling du statut de dossier) mais **n'est pas encore installé** dans ce workspace

## Démarrage (depuis la racine du repo)

```powershell
npm run dev --workspace=front
```

`predev`/`prebuild` reconstruisent `@kyb/shared` avant de lancer/builder le front. App sur [http://localhost:3000](http://localhost:3000).

## État actuel — à lire avant de coder

- Parcours mocké, **pas encore branché à l'API back** : `src/app/{documents,verify,complete,summary}/page.tsx`, données factices dans `src/lib/mock-data.ts`, état partagé dans `src/context/OnboardingContext.tsx`.
- Pas de routes dynamiques `/dossier/[id]/...` comme décrit dans la spec — routes plates (`/documents`, `/verify`, `/complete`, `/summary`) définies dans `src/lib/navigation.ts`.
- Pas d'appel réseau, pas de TanStack Query, pas de polling.
- Types locaux dans `src/types/onboarding.ts` (`UploadedDocument`, `ExtractedField`, `AlertItem`…) : à terme, remplacer/aligner par les types dérivés de `@kyb/shared` plutôt que d'en garder deux jeux séparés.

## Repères dans le code

- `src/lib/navigation.ts` — ordre des étapes (`documents` → `verify` → `complete` → `summary`)
- `src/lib/validation.ts` — validations actuelles côté front (à terme partagées avec le back via Zod)
- `src/components/layout/` — `AppShell`, `PageIntro`, `StepFooter` (structure commune des écrans du parcours)
- `src/components/ui/` — `Button`, `StatusBadge`

## Important

@AGENTS.md
