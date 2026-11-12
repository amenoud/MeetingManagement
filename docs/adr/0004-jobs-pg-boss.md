# ADR-0004 – Jobs dans PostgreSQL (pg-boss)

- Statut : proposé
- Date : 2026-11-12

## Contexte
Besoins : envoi de convocations et relances, rendu PDF, export tenant, purge. Contrainte : infra la plus légère possible (pas de Redis).

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **pg-boss** (file dans PostgreSQL, planification cron, reprise, retries) | Aucune infra en plus, transactionnel avec l'outbox | Charge sur la base (négligeable à cette échelle) |
| B. BullMQ + Redis | Très répandu | 1 service managé de plus, coût, isolation par préfixe |
| C. Cron du PaaS + endpoints | Simple | Pas de retries, pas d'idempotence |

## Décision
Option A. Patron **outbox** : l'action métier et l'insertion du job sont dans la **même transaction** (pas d'e-mail fantôme ni de convocation perdue). Chaque job : payload `{ tenantId, … }`, clé d'idempotence, 5 tentatives avec backoff exponentiel, file « morte » surveillée. Le worker s'exécute dans le même conteneur (`ROLE=all`) au MVP.

## Conséquences
Si l'échelle l'exige, le worker est extrait en second conteneur sans changement de code. Les jobs planifiés (relances, purge) tournent avec un leader unique (garanti par pg-boss).
