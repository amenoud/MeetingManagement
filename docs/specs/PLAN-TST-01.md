# PLAN-TST-01 – Audit automatique du catalogue (isolation bloquante en CI)

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC13) · ADR-0002 §8 · Issue : TST-01 · Taille : M
- Branche : `test/tst-01-catalog-audit` · Dépend de : DB-02 (fait)

## 1. Pourquoi
Aujourd'hui, protéger une table repose sur la discipline (« appeler `enable_tenant_isolation` »). Un oubli ne se verrait pas. TST-01 transforme la convention en **contrôle mécanique** : la CI échoue, en nommant la table fautive, dès qu'une migration crée une table non conforme.

État actuel : le schéma de production `app` ne contient **aucune table** (constaté le 2026-11-12). Le contrôle devient pleinement utile dès ID-01 ; on le construit maintenant pour qu'**aucune** table n'arrive sans lui.

## 2. Règles contrôlées
L'audit lit le catalogue PostgreSQL d'une base migrée (schéma `app`) et produit une liste de constats `{ règle, table, détail }`.

| Règle | Exigence | Pourquoi |
|---|---|---|
| **R1** isolation | Toute table portant une colonne `tenant_id` : colonne `uuid NOT NULL` ; RLS **activée et forcée** ; politique `tenant_isolation` unique de type *permissive*, pour toutes les commandes, dont `USING` et `WITH CHECK` valent exactement `tenant_id = app.current_tenant_id()` ; **aucune autre politique permissive** (elles s'additionnent et élargiraient l'accès) | AC13 |
| **R2** racine | Une table clé par l'organisation elle-même (future `tenant`) : même contrôle sur la colonne `id`, listée dans les exceptions comme « racine » | Cas particulier de R1 |
| **R3** table globale | Toute table **sans** `tenant_id` et non « racine » doit figurer dans la liste d'exceptions avec une justification ; sinon échec | Empêche d'oublier la colonne |
| **R4** FK composites | Toute FK entre deux tables à `tenant_id` contient `tenant_id` des deux côtés ; une FK vers une table globale ou la racine est permise | AC14 rendu automatique |
| **R5** unicité | Tout index unique d'une table à `tenant_id` contient `tenant_id` | Pas de collision ni de fuite d'existence entre organisations |
| **R6** index | Toute table à `tenant_id` a un index dont la première colonne est `tenant_id` | Performance de la RLS |
| **R7** vues | Toute vue du schéma `app` a `security_invoker = true` ; aucune vue matérialisée (elles n'ont pas de RLS) sauf exception | Une vue ordinaire s'exécute avec les droits de son propriétaire et contournerait la RLS |
| **R8** fonctions | Aucune fonction `SECURITY DEFINER` du schéma `app` sauf exception justifiée | Elle s'exécute avec les droits du propriétaire |
| **R9** droits | `app_rw` n'a jamais `TRUNCATE`, `REFERENCES`, `TRIGGER` ; `PUBLIC` n'a aucun droit sur les tables de `app` | Cohérent avec DB-01 |
| **R10** périmètre | Aucune table hors des schémas `app` et `meta` (ex. `public`) | Rien d'oublié hors du radar |

## 3. Liste d'exceptions : difficile à élargir par erreur
Fichier `db/isolation-exceptions.json` :
```json
{ "globalTables": [ { "table": "app.user", "reason": "identité globale, une personne appartient à plusieurs organisations", "approvedIn": "ID-01" } ],
  "rootTables":   [ { "table": "app.tenant", "column": "id", "reason": "...", "approvedIn": "ID-01" } ],
  "securityDefinerFunctions": [], "materializedViews": [] }
```
Garde-fous : chaque entrée exige `reason` (texte réel, minimum 20 caractères) et `approvedIn` ; le test échoue si une entrée **ne correspond à aucune table existante** (entrée périmée) ou si une table « globale » **possède** `tenant_id` ; le fichier est sous `CODEOWNERS` et une case du template de PR demande de justifier tout ajout. La liste est **vide aujourd'hui**.

## 4. Livrables
- `src/platform/db/isolation-audit.ts` : `auditIsolation(connectionString, exceptions)` → constats (réutilisable en exploitation).
- `scripts/db-audit.ts` + `pnpm db:audit` : audite une base réelle (utile pour staging/production, incrément 0b), code de sortie non nul en cas de constat.
- `tests/isolation/` : déplacement de la suite de DB-02 (`isolation.test.ts`, fixtures) + nouveaux tests ; helpers partagés dans `tests/helpers/`.
- Config Vitest : suites `integration` et `isolation` séparées ; scripts `test:integration`, `test:isolation`.
- **Nouveau job CI `isolation`**, distinct de `integration`, **requis** dans le ruleset (signal explicite « l'isolation est vérifiée »), avec PostgreSQL de service.
- `CODEOWNERS` et template de PR : ajouts liés à l'exceptions.

## 5. Tests : on teste le test
1. **Schéma réel** : migrations de production appliquées dans une base jetable, audit ⇒ **0 constat** (aujourd'hui trivial, deviendra déterminant dès ID-01).
2. **Cas conformes** : un jeu de tables correctes (racine, parent/enfant composite, table globale déclarée) ⇒ 0 constat.
3. **Un cas fautif par règle** (R1 à R10) dans une base jetable, chacun doit produire **exactement** le constat attendu et nommer la table : colonne `tenant_id` sans RLS ; RLS sans `FORCE` ; politique à expression erronée (`USING (true)`) ; seconde politique permissive ; table sans `tenant_id` non déclarée ; FK simple ; unique global ; absence d'index ; vue sans `security_invoker` ; fonction `SECURITY DEFINER` ; `GRANT TRUNCATE` ; table dans `public`.
4. **Liste d'exceptions** : entrée sans raison, entrée périmée, table « globale » avec `tenant_id` ⇒ échec.
5. **Mutation du contrôle lui-même** : j'affaiblis volontairement l'audit (ignorer `FORCE`, ignorer R4) et je vérifie que les tests de l'étape 3 échouent.
6. **Preuve AC13 sur GitHub** : une PR jetable ajoutant une migration qui crée une table avec `tenant_id` **sans** appeler le helper ⇒ le job `isolation` est rouge et le merge est refusé ; je la ferme sans fusion.

## 6. Risques
- **Faux positifs** (règles trop strictes) : chaque règle a son test positif et son message explicite ; les cas légitimes passent par la liste d'exceptions.
- **Fragilité de la comparaison des expressions** : je compare `pg_get_expr` à l'expression attendue après normalisation, sur PostgreSQL 16 ; un changement de version majeure est couvert par les tests (échec visible, pas silencieux).
- **Périmètre non couvert** : tables partitionnées/héritées, extensions, schémas supplémentaires : R10 signale tout schéma imprévu ; partitionnement : à traiter si on l'adopte.
- **Maintenance** : ~300 lignes d'audit ; coût accepté car chaque table future en bénéficie.
- **Rôles de test** : l'audit s'exécute avec un rôle d'administration (lecture du catalogue) ; il n'écrit rien.

## 7. Hors périmètre
Tests d'isolation par route/service (ils accompagnent chaque fonctionnalité) ; isolation des fichiers, jobs et logs (à leurs issues respectives) ; test de charge des politiques RLS.

## 8. Questions pour G2
1. **Jeu de règles R1 à R10 complet** dès maintenant (reco : oui, c'est peu coûteux avant qu'il existe des tables) ou seulement R1 à R3 (minimum d'AC13) ?
2. **Job CI `isolation` distinct et requis** (reco : oui) ?
3. **Déplacer la suite d'isolation de DB-02 vers `tests/isolation/`** et factoriser les helpers (refactor mécanique, reco : oui) ?
4. **Liste d'exceptions** avec `reason` + `approvedIn`, entrées périmées refusées, sous CODEOWNERS (reco : oui) ?
