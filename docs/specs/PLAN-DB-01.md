# PLAN-DB-01 – Couche base de données (rôles, migrations, `withTenant`)

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC9, AC11, AC12 ; prépare AC8, AC10, AC13, AC14) · ADR-0002 · Issue : DB-01 · Taille : **M-L, à découper (voir §2)**
- Branche : `feat/db-01-database-layer` · Dépend de : INF-03, INF-04 (faits)

## 1. Périmètre
Poser les fondations de l'isolation **sans table métier** : les rôles SQL, un exécuteur de migrations, et la fonction `withTenant()` qui est l'unique porte d'accès SQL de l'application. Les tables `tenant`/`probe` avec RLS (DB-02) et la suite d'isolation complète (TST-01) viennent ensuite.

## 2. Découpage proposé en 2 PR (chacune < 400 lignes hors tests)
| PR | Contenu | Critères |
|---|---|---|
| **DB-01a** | Bootstrap des rôles + exécuteur de migrations + première migration (schéma, privilèges par défaut) | AC12 |
| **DB-01b** | Pool + `withTenant()` + job CI `integration` (PostgreSQL de service) + règles d'import | AC9 (partie), AC11 |

## 3. Décisions techniques à valider
### 3.1 Migrations : SQL pur + petit exécuteur, ou drizzle-kit ?
| Option | Pour | Contre |
|---|---|---|
| **A. Fichiers SQL versionnés + exécuteur maison (~80 lignes)** : table `schema_migrations` (nom, checksum SHA-256, date), verrou consultatif, une transaction par migration, échec si le checksum d'une migration déjà appliquée change | Les rôles, `FORCE ROW LEVEL SECURITY`, politiques et triggers d'immutabilité (ADR-0006) sont du SQL ; ils restent lisibles et revus tels quels ; aucun outil à contourner | À maintenir (petit) ; schéma TypeScript Drizzle écrit à la main (DB-02) |
| B. `drizzle-kit` (génère les migrations depuis le schéma TS) | Moins d'écriture pour les tables simples | `FORCE RLS`, rôles, triggers et privilèges demandent de toute façon du SQL personnalisé ; risque de dérive entre migrations générées et SQL manuel |
| C. `node-pg-migrate` / `dbmate` | Outil éprouvé | Dépendance de plus ; apport limité vs A |

**RECO : A.** Drizzle reste l'ORM de requêtes (ADR-0001) ; un test de non-régression comparera le schéma TypeScript au catalogue PostgreSQL dès DB-02.

### 3.2 Pilote PostgreSQL
`pg` (node-postgres) avec `drizzle-orm/node-postgres`. **RECO : `pg`** : le plus répandu, prise en charge fine des transactions et des paramètres de session. Versions : les dernières stables, relevées à l'exécution.

### 3.3 Trois identités SQL, trois chaînes de connexion
| Rôle | Usage | Droits | Variable |
|---|---|---|---|
| `postgres` (administrateur, existant en local) | **Bootstrap uniquement** (création des rôles) ; jamais dans l'application | superuser local | `DATABASE_ADMIN_URL` |
| `app_migrator` | Exécute les migrations ; **propriétaire** des objets | `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `CREATE` sur le schéma de l'appli | `DATABASE_MIGRATOR_URL` |
| `app_rw` | Application à l'exécution | `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, **non propriétaire** ; `SELECT/INSERT/UPDATE/DELETE` via privilèges par défaut ; aucun `CREATE`/`DROP`/`TRUNCATE` | `DATABASE_URL` |

`REVOKE ALL ON SCHEMA public FROM PUBLIC` et `REVOKE CREATE ON DATABASE … FROM PUBLIC` ; schéma applicatif dédié (`app`). Délais de sécurité au niveau du rôle `app_rw` : `statement_timeout`, `idle_in_transaction_session_timeout`.

### 3.4 `withTenant()`
```
withTenant(tenantId, fn): ouvre une transaction, exécute
  select set_config('app.tenant_id', $1, true)   -- portée = transaction
puis fn(tx), COMMIT ; ROLLBACK si fn échoue.
```
- `tenantId` validé comme **UUID** avant tout accès SQL (rejet immédiat sinon).
- `tx` n'est valable que pendant l'appel (documenté, testé) ; pas d'imbrication de `withTenant` (erreur explicite).
- Le pool n'est **jamais exporté** : seul le module `platform/db` ouvre des connexions. Une règle ESLint et une règle dependency-cruiser interdisent d'importer `pg` ailleurs.
- Valeur de contexte non définie ⇒ la politique RLS (DB-02) renvoie 0 ligne (échec fermé).

### 3.5 Bootstrap des rôles
Script idempotent `pnpm db:bootstrap` (utilise `DATABASE_ADMIN_URL`) ; mots de passe lus depuis l'environnement (valeurs de dev factices en local). **Limite connue** : sur un PostgreSQL managé, la création de rôles peut être restreinte ; la procédure sera revue en incrément 0b (le script fournira le SQL à exécuter manuellement si besoin).

## 4. Fichiers (aperçu)
`db/bootstrap/roles.sql`, `db/migrations/0001_baseline.sql`, `src/platform/db/{migrate.ts,pool.ts,with-tenant.ts,index.ts}`, `scripts/db-bootstrap.ts`, mise à jour de `config.ts`/`.env.example`/`docker-compose.yml` (l'application utilisera `app_rw`), scripts `db:bootstrap`, `db:migrate`, `db:setup`, `test:integration`, job CI `integration`, tests dans `tests/integration/`.

## 5. Tests (PostgreSQL réel, jamais de mock)
- **AC12** : `app_rw` n'est ni superuser, ni `BYPASSRLS`, ni propriétaire d'une table ; ne peut pas `CREATE TABLE`/`DROP` ; `app_migrator` n'est ni superuser ni `BYPASSRLS`.
- **AC9 (partie)** : hors `withTenant`, le réglage `app.tenant_id` est vide ; dans `withTenant(A)` il vaut A.
- **AC11** : avec un pool limité à **1 connexion** (réutilisation forcée), `withTenant(A)` puis `withTenant(B)` puis une requête hors contexte : aucun résidu ; exécutions concurrentes entrelacées sans croisement ; contexte réinitialisé après `ROLLBACK` sur erreur.
- Rejet d'un `tenantId` non UUID, y compris une tentative d'injection (`'; drop table …`).
- Migrations : application idempotente, checksum modifié ⇒ échec explicite, deux exécutions concurrentes sérialisées par le verrou.
- **CI** : nouveau job `integration` avec un conteneur PostgreSQL de service, `db:bootstrap` + `db:migrate` + tests ; il devient un **check requis** après merge (modification du ruleset **avec votre accord**).
- Je donne les résultats réels (exécutés en local avec votre Docker et sur GitHub).

## 6. Risques
- **Fuite de contexte par un pooler** : atténuée par `set_config(..., true)` (transaction) ; test AC11 ; le mode « transaction pooling » d'un futur pooler reste compatible.
- **Rôle applicatif trop puissant par erreur** (privilèges par défaut) : tests AC12 sur le catalogue (`pg_roles`, `pg_tables`, `has_*_privilege`).
- **Migrations non rejouables** : checksum + verrou ; migrations de référence idempotentes là où c'est possible.
- **Identifiants en clair dans le dépôt public** : valeurs factices de dev uniquement ; `DATABASE_ADMIN_URL` absent de l'environnement de l'application (compose et CI).
- **Complexité TLS en production** : `ssl` exigé hors localhost, vérifié à l'incrément 0b.

## 7. Hors périmètre
Tables métier, politiques RLS, FK composites (DB-02) ; suite d'isolation sur catalogue (TST-01) ; sauvegarde/restauration (OPS-03) ; pooler externe.

## 8. Questions pour G2
1. **Découper en DB-01a / DB-01b** (2 PR) ? Reco : oui.
2. **Migrations en SQL pur + exécuteur maison** (option A) ? Reco : oui.
3. **Pilote `pg`** avec Drizzle ? Reco : oui.
4. **Check `integration`** requis après merge de DB-01b ? Reco : oui.
