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
