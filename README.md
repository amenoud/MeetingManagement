# MeetingManagement

Application web multitenante de gestion de séances de comité (procès-verbaux, décisions, risques), pour entreprises et associations. Suisse (nLPD) et UE (RGPD).

> Statut : en cadrage / incrément 0. Pas encore de fonctionnalités.

## Documentation

- Cadrage, architecture, sécurité, processus : [`docs/`](docs/)
- Règles pour l'agent IA : [`CLAUDE.md`](CLAUDE.md)
- Spec en cours : [`docs/specs/SPEC-000-socle.md`](docs/specs/SPEC-000-socle.md)

## Démarrage

Prérequis : Node.js 24 (voir `.nvmrc`) et pnpm.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## Environnement local (Docker)

Docker doit être démarré.

```bash
pnpm docker:up      # PostgreSQL, S3 (RustFS), Mailpit
pnpm test:docker    # smoke test complet, avec l'image de l'application
pnpm docker:down    # arrête les services (garde les données)
pnpm docker:reset   # arrête et supprime les volumes
```

| Service                    | Adresse locale                                                           |
| -------------------------- | ------------------------------------------------------------------------ |
| PostgreSQL                 | `127.0.0.1:5433` (5433 pour ne pas heurter un PostgreSQL local sur 5432) |
| S3                         | `http://127.0.0.1:9000` (console `:9001`)                                |
| Mailpit (SMTP / interface) | `127.0.0.1:1025` / `http://127.0.0.1:8025`                               |

Les identifiants sont **factices** (dépôt public). Voir `.env.example` pour les surcharger.

### Base de données

```bash
cp .env.example .env     # une seule fois (valeurs factices)
pnpm docker:up
pnpm db:setup            # crée les rôles app_migrator / app_rw puis applique db/migrations
pnpm test:integration    # tests sur un vrai PostgreSQL (bases jetables)
```

L'application se connecte avec `app_rw` (ni propriétaire, ni superuser, ni `BYPASSRLS`). `DATABASE_ADMIN_URL` ne sert qu'au bootstrap et n'est jamais donnée à l'application. Voir `docs/adr/0002-multitenance-rls.md`.

## Scripts

| Script                         | Rôle                                  |
| ------------------------------ | ------------------------------------- |
| `pnpm lint`                    | ESLint                                |
| `pnpm format` / `format:check` | Prettier                              |
| `pnpm typecheck`               | TypeScript strict                     |
| `pnpm test` / `test:unit`      | Vitest (avec couverture)              |
| `pnpm depcruise`               | Contrôle des frontières entre modules |

## Contribution

Une issue = une branche = une PR, commits [Conventional Commits](https://www.conventionalcommits.org/). Voir `docs/10-processus-adlc.md`. `main` est protégée : pas de push direct.

## Licence

Copyright, tous droits réservés. Aucune licence d'utilisation, de copie ou de redistribution n'est accordée.
