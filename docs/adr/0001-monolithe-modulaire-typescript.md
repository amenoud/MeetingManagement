# ADR-0001 – Monolithe modulaire TypeScript

- Statut : proposé (gate G0)
- Date : 2026-11-12

## Contexte
Une personne + un agent IA. Un seul conteneur. Aucune contrainte de stack (FAIT). Les agents IA sont plus fiables avec un seul langage typé, un seul dépôt, des conventions strictes.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **TypeScript full-stack : Next.js (App Router) + Drizzle + PostgreSQL** | Un langage, types de bout en bout, écosystème (i18n, PDF, tests), déploiement en 1 conteneur | Next.js évolue vite ; discipline requise pour ne pas mélanger UI et domaine |
| B. TypeScript : Fastify/Hono (API) + React (Vite) | Séparation nette, moins de « magie » | 2 artefacts ou assemblage manuel ; plus de code d'intégration |
| C. Python (Django) ou PHP (Laravel) | Back-office intégré, admin gratuit | Moins homogène avec un front moderne ; i18n et RLS exigent aussi du soin |

## Décision
**Option A** : Next.js en mode `output: standalone`, TypeScript `strict`, Drizzle ORM (SQL explicite, migrations SQL versionnées, transactions maîtrisées pour RLS), Zod pour la validation, Vitest + Playwright pour les tests, ESLint + Prettier, `dependency-cruiser` pour les frontières de modules.

## Conséquences
- Le domaine vit dans `src/modules/*` sans dépendance à Next.js ; `app/` ne contient que de la glue.
- Version de Node figée (LTS), `pnpm` avec lockfile.
- Réversibilité : un module sans dépendance au framework permet de passer à l'option B si Next.js devient un frein.
- Prisma écarté : l'abstraction complique `SET LOCAL` par transaction et les triggers/RLS.
