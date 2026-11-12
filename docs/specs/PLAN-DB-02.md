# PLAN-DB-02 – Isolation par RLS : helper, tables témoins, tests

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC8, AC9 reste, AC10, AC14 ; prépare AC13 = TST-01) · ADR-0002 · Issue : DB-02 · Taille : M
- Branche : `feat/db-02-rls-isolation` · Dépend de : DB-01 (fait)

## 1. Périmètre
Rendre l'isolation **vérifiable sur des lignes réelles** : un mécanisme unique pour protéger une table (RLS `ENABLE` + `FORCE` + politique), et des tests qui tentent de le contourner. Aucune table métier (elles viennent avec ID-01 et la suite). Le contrôle automatique du catalogue (AC13) reste dans TST-01.

## 2. Écart assumé par rapport au backlog
Le backlog dit « table témoin `tenant` + `probe` ». Je propose de **ne pas livrer de vraie table `tenant` ici** : sa structure (nom, locale, statut, MFA imposé…) relève d'ID-01 et ferait un schéma de production provisoire. DB-02 livre donc **le mécanisme** (production) et des **tables de test** (uniquement dans les tests). Conséquence : le schéma de production reste vide de tables après DB-02, ce qui est sain.

## 3. Éléments

### 3.1 Migration `0002_tenant_isolation_helper.sql` (production)
Fonction `app.enable_tenant_isolation(target regclass, tenant_column name default 'tenant_id')`, exécutable **par `app_migrator` seulement** (pas `app_rw`), qui, de façon idempotente :
1. vérifie que la colonne existe, est `uuid` et `NOT NULL` (sinon erreur explicite) ;
2. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **et** `FORCE ROW LEVEL SECURITY` ;
3. crée (ou remplace) la politique `tenant_isolation` pour **toutes les commandes** :
   `USING (<col> = app.current_tenant_id()) WITH CHECK (<col> = app.current_tenant_id())` ;
4. ne s'applique pas à un rôle en particulier (la politique vaut pour tout rôle sans `BYPASSRLS`, y compris le propriétaire grâce à `FORCE`).

Pour la future table `tenant` elle-même : `tenant_column => 'id'` (une organisation ne voit que sa propre ligne).

### 3.2 Convention de table (à inscrire dans CLAUDE.md)
```
tenant_id uuid not null default app.current_tenant_id()
primary key (tenant_id, id)                       -- ou unique (tenant_id, id)
foreign key (tenant_id, parent_id) references parent (tenant_id, id)   -- FK composites
unique (tenant_id, <colonne métier>)              -- jamais d'unicité globale
index commençant par tenant_id
select app.enable_tenant_isolation('app.ma_table');
```
Pourquoi : les contrôles d'intégrité référentielle **ignorent la RLS** ; une FK simple permettrait de référencer une ligne d'une autre organisation. Une unicité globale révélerait l'existence de données d'autrui par collision.

### 3.3 Tables de test (uniquement dans `tests/integration/fixtures/`)
`iso_tenant_like` (isolation sur `id`), `iso_parent`, `iso_child` (FK **composite**), `iso_child_naive` (FK **simple**, témoin négatif). Créées par une migration de test appliquée après les migrations de production, dans la base jetable.

## 4. Tests (PostgreSQL réel)
| Critère | Test |
|---|---|
| **AC8** | Deux organisations insèrent des lignes via `withTenant` ; chacune ne lit que les siennes ; `UPDATE`/`DELETE` visant une ligne de l'autre affectent **0 ligne** |
| **AC9** (reste) | Hors `withTenant`, un `SELECT` renvoie 0 ligne et un `INSERT` est refusé (violation de politique, `42501`) |
| **AC10** | Sous A, `INSERT` avec `tenant_id = B` refusé ; `UPDATE … SET tenant_id = B` refusé |
| **AC14** | `iso_child` (A) référençant un parent de B ⇒ violation de FK `23503` ; **témoin négatif** : `iso_child_naive` accepte la même référence, ce qui prouve l'utilité des FK composites |
| FORCE | Le **propriétaire** `app_migrator`, sans contexte, ne voit aucune ligne |
| Unicité | `unique (tenant_id, name)` : le même nom dans A et B est accepté (aucune collision visible entre organisations) |
| Défaut | `tenant_id` omis sous A ⇒ valeur A ; hors contexte ⇒ échec `NOT NULL` |
| Helper | idempotent ; erreur claire si la colonne manque ou n'est pas `uuid NOT NULL` ; **non exécutable par `app_rw`** ; `app_rw` ne peut pas `DISABLE ROW LEVEL SECURITY` ni modifier la politique |
| Mutation | j'affaiblis volontairement (retirer `FORCE`, politique en `USING` seul sans `WITH CHECK`, FK simple) et je vérifie que les tests échouent, comme pour DB-01 |

Les résultats réels (local + CI) sont donnés dans la PR.

## 5. Risques
- **Superuser/`BYPASSRLS` contournent la RLS** (par conception de PostgreSQL) : c'est pourquoi `app_rw` n'a aucun des deux et pourquoi aucune chaîne administrateur n'est donnée à l'application (DB-01).
- **Performances** : la fonction du contexte est `STABLE` (évaluée une fois par requête) ; index commençant par `tenant_id` imposés par convention ; un test de plan d'exécution viendra avec la première vraie table.
- **Oubli d'appel du helper** sur une nouvelle table : traité par le contrôle de catalogue bloquant de **TST-01** (prochaine issue).
- **Erreurs de messages** : les violations de politique ne doivent pas révéler d'information ; je vérifie que le message n'inclut pas de valeur d'une autre organisation.
- **Données globales** (`user`, `session`) hors RLS : elles seront déclarées explicitement dans une liste blanche contrôlée par TST-01.

## 6. Hors périmètre
Vraie table `tenant`, `user`, `membership` (ID-01) ; contrôle de catalogue (TST-01) ; identifiants UUID v7 côté application (ID-01).

## 7. Questions pour G2
1. **Fonction helper** `enable_tenant_isolation` plutôt que du SQL explicite dans chaque migration ? Reco : oui (une seule définition de la politique).
2. **Pas de vraie table `tenant` dans DB-02** (écart §2), tables de test seulement ? Reco : oui.
3. **`tenant_id` avec valeur par défaut** `app.current_tenant_id()` (la politique `WITH CHECK` valide de toute façon) ? Reco : oui.
