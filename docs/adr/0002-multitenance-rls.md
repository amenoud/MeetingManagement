# ADR-0002 – Multitenance : base partagée + tenant_id + RLS

- Statut : proposé
- Date : 2026-11-12

## Options
| Option | Isolation | Coût/ops | Verdict |
|---|---|---|---|
| A. **Base et schéma partagés, `tenant_id`, RLS PostgreSQL** | Forte si bien configurée (garantie par la base) | Minimal : 1 base, 1 migration | **Retenue** |
| B. Schéma par tenant | Forte | Migrations × N, pooling complexe, difficile à tester | Écartée |
| C. Base par tenant | Maximale | Coût et ops prohibitifs pour un PaaS léger | Option future « tenant premium » |

## Décision
Option A, avec les règles suivantes :

1. Rôle PostgreSQL applicatif `app_rw` : **non propriétaire des tables, sans `BYPASSRLS`, sans superuser**. Un rôle distinct `app_migrator` exécute les migrations.
2. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **et** `FORCE ROW LEVEL SECURITY` sur toute table portant `tenant_id`.
3. Politique type : `USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (idem)`. Si le réglage est absent, `NULL` ⇒ aucune ligne (échec fermé).
4. Contexte posé uniquement par `withTenant()` : transaction + `set_config('app.tenant_id', $1, true)` (portée transaction, donc sûr avec un pooler en mode transaction). **Garde-fous ajoutés à l'implémentation (DB-01b)** : l'identifiant est validé comme UUID non nul avant tout accès SQL ; la même requête lit la valeur précédente du réglage et **refuse puis détruit la connexion** si elle n'est pas vide (détection d'une fuite de contexte de session) ; les appels imbriqués sont interdits ; le handle `tx` lève une erreur s'il est utilisé après la fin de l'appel (limite : un constructeur de requête Drizzle créé dans l'appel puis exécuté après n'est pas intercepté ; il s'exécuterait sans contexte, donc échec fermé par la RLS).
5. Tables globales (`user`, `session`, `mfa_credential`) sans `tenant_id` ; accès aux appartenances via `membership` (RLS par `user_id` ou tenant).
6. FK composites `(tenant_id, id)` pour interdire les références inter-tenants.
7. Fichiers : préfixe `tenants/{tenant_id}/`, URL signées générées après contrôle de droit. Jobs : payload obligatoire `tenantId`. Logs : champ `tenant_id`. Recherche : FTS dans PostgreSQL, donc sous RLS. Cache : pas de cache partagé au MVP.
8. **Tests d'isolation en CI (bloquants)** :
   - un test paramétré parcourt le catalogue `pg_class`/`pg_policies` et échoue si une table avec `tenant_id` n'a pas RLS `FORCE` + politique ;
   - un test d'intégration crée 2 tenants, exécute chaque service/route avec le contexte du tenant A et vérifie qu'aucune donnée du tenant B n'est lue, modifiée ni listée (y compris recherche, export, URL de fichier) ;
   - un test vérifie qu'une requête sans contexte renvoie 0 ligne ;
   - un test vérifie que `app_rw` n'a pas `BYPASSRLS`.

## Conséquences
- Légère charge de performance (index commençant par `tenant_id`).
- Les requêtes d'administration transverses (support) passent par un rôle dédié, journalisé, jamais accessible depuis l'application.
