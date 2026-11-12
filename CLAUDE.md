# CLAUDE.md – Règles pour l'agent (Comités)

Application web multitenante de gestion de séances de comité (Suisse, nLPD/RGPD). Langue du produit : FR/DE/EN. Langue des docs et commits : français pour les docs, **anglais pour le code et les messages de commit**.

## Processus (impératif)
1. **Spec d'abord.** Pas de code sans spec validée dans `docs/specs/` (gate G1) et plan validé (G2). En cas de doute, demande.
2. **1 issue = 1 branche = 1 PR** (< 400 lignes hors migrations/tests). Branche `feat|fix|chore/<issue>-<slug>`.
3. Ne **jamais** pousser sur `main`, fusionner, déployer, modifier la protection de branche ou contourner un check.
4. Commits **Conventional Commits** (`feat(minutes): …`), référence `Refs #n`.
5. Tout écart de périmètre ⇒ nouvelle issue, pas de « tant qu'on y est ».
6. Mets à jour la doc dans la même PR : spec, ADR, glossaire, ce fichier si une règle change.

## Stack et structure
TypeScript `strict`, Next.js (App Router, `output: standalone`), Drizzle, PostgreSQL, pg-boss, Zod, `next-intl`, Vitest, Playwright, pnpm. Monolithe modulaire : `src/modules/<module>` (domaine, sans dépendance à Next.js), `src/platform` (db, authz, auth, jobs, storage, mail, pdf, search), `src/app` (glue uniquement). Un module n'importe que `index.ts` d'un autre module (vérifié par dependency-cruiser).

## Multitenance et isolation (non négociable)
- Toute table métier : `tenant_id uuid not null`, `ENABLE` **et** `FORCE ROW LEVEL SECURITY`, politique sur `current_setting('app.tenant_id', true)`, FK composites `(tenant_id, id)`.
- Tout accès SQL passe par `withTenant(tenantId, fn)` (transaction + `set_config(..., true)`). Jamais de connexion « nue ».
- Le rôle applicatif n'est ni propriétaire ni `BYPASSRLS`. N'utilise jamais le rôle de migration à l'exécution.
- Jobs : `tenantId` obligatoire dans le payload. Fichiers : clés `tenants/{tenant_id}/…`. Logs : toujours `tenant_id`. Pas de cache partagé.
- Toute nouvelle table/route/job/recherche s'accompagne d'un **test d'isolation** dans `tests/isolation/`. La CI le rend bloquant.

## Droits
- Un seul point d'entrée : `authz.can(user, action, resource)`. Pas de test de rôle dans les routes ou l'UI.
- Refus par défaut. Chaque route/action a un test « refus » par rôle non autorisé, aligné sur `docs/04-roles-permissions.md`.
- Un admin d'organisation n'a pas accès au contenu des organes sans mandat.

## Immutabilité et audit
- Décisions, PV verrouillés, approbations, journal d'audit : **jamais d'UPDATE/DELETE** (triggers + REVOKE, ADR-0006). Correction = rectificatif ou nouvelle décision.
- Toute action sensible écrit au journal d'audit (qui, quand, quoi, tenant). Hash SHA-256 sur contenu canonique.
- Les personnes sont référencées par identifiant dans les contenus immuables (anonymisation possible).

## Sécurité
- Valide toute entrée avec Zod aux frontières. Requêtes paramétrées uniquement. Pas de `dangerouslySetInnerHTML`.
- Mots de passe Argon2id, sessions opaques hachées, TOTP, ré-authentification pour approuver un PV (ADR-0003). Pas de cryptographie maison.
- Aucun secret, jeton ni donnée réelle dans le code, les tests, les logs ou les captures. Utilise `.env.example` et des données synthétiques.
- Pas de nouveau sous-traitant ni de service externe sans ADR. **Aucun service soumis au droit américain** pour des données de production.
- Téléversements : liste blanche MIME par signature, taille max, `Content-Disposition: attachment`.
- Pas de `fetch` vers une URL fournie par l'utilisateur.

## Qualité
- Tests pour chaque critère d'acceptation, nommés avec son ID (`it('SPEC-012-AC3 …')`). Pas de test désactivé ni de mock qui masque RLS : les tests d'intégration utilisent un vrai PostgreSQL.
- Avant de déclarer une tâche terminée : `pnpm lint && pnpm typecheck && pnpm test` doivent passer ; dis explicitement ce qui n'a pas été exécuté.
- Pas de `any`, pas de `// @ts-ignore` sans commentaire justifié. Fonctions courtes, noms du glossaire (`docs/02-glossaire.md`).
- Migrations : SQL versionné dans `db/migrations`, rétrocompatibles (expand/contract), jamais destructives sans accord explicite.

## i18n
Aucune chaîne en dur dans l'UI, e-mails ou PDF : clés dans `src/messages/{fr,de,en}.json`, les 3 langues dans la même PR. Dates/nombres via `Intl`, fuseau `Europe/Zurich` par défaut.

## Vocabulaire
Utilise exactement les termes du glossaire (organe = `body`, séance = `meeting`, point d'ODJ = `agenda_item`, décision = `decision`, PV = `minutes`, mandat = `mandate`). Ne crée pas de synonymes.

## Quand tu n'es pas sûr
Pose la question, propose 2 options avec leurs compromis, et attends la décision. Distingue toujours faits, hypothèses et recommandations. Pas d'avis juridique : signale les points à valider par un juriste.
