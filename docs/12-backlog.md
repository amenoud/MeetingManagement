# 12 – Backlog initial (incréments 0 et 1)

Format : `ID – titre` · taille (S ≈ ≤ 3 h, M ≈ 3-6 h, L = à découper) · dépendances · critères d'acceptation (CA) clés. Chaque issue référence sa spec (à rédiger à la gate G1). Labels : `inc:0`/`inc:1`, `module:*`, `type:*`.

## Incrément 0 – Socle (SPEC-000)

| ID | Titre | Taille | Dép. | CA clés |
|---|---|---|---|---|
| INF-01 | Initialiser le dépôt, outillage et scripts (pnpm, TS strict, ESLint, Prettier, Vitest, commitlint, husky) | M | – | `pnpm lint/typecheck/test` fonctionnent ; commit non conforme refusé |
| INF-02 | Créer le dépôt GitHub, décider public/privé et plan (coûts), protection de `main`, labels, Project, templates PR/issues, CODEOWNERS | S | INF-01 | Push direct sur `main` refusé ; PR sans check vert non fusionnable |
| INF-03 | Docker : `Dockerfile` multi-étapes (utilisateur non root, image minimale) + `docker-compose` (Postgres, MinIO, Mailpit) | M | INF-01 | `docker compose up` ⇒ app joignable ; image < 300 Mo |
| INF-04 | Workflow CI (qualité, tests, build, SBOM), actions épinglées par SHA | M | INF-01, 02 | CI verte sur PR ; échec si lint/test échoue |
| INF-05 | Workflow sécurité (CodeQL ou Semgrep, gitleaks, audit dépendances, trivy) + Dependabot | S | INF-04 | Secret factice injecté ⇒ CI rouge |
| DB-01 | Couche base : Drizzle, migrations SQL, rôles `app_migrator` / `app_rw`, `withTenant()` | M | INF-03 | Requête hors `withTenant` ⇒ 0 ligne ; `app_rw` sans BYPASSRLS |
| DB-02 | Table témoin `tenant` + `probe` avec RLS FORCE + politique + FK composites | S | DB-01 | CA : lecture/écriture inter-tenants impossibles |
| TST-01 | Suite d'isolation : méta-test du catalogue (`pg_policies`), test 2 tenants, test sans contexte, test des rôles ; branchée en CI **bloquante** | M | DB-02, INF-04 | Table ajoutée sans RLS ⇒ CI rouge |
| PLT-01 | Plateforme transverse : configuration typée (Zod, `.env.example`), logger structuré (`tenant_id`, `request_id`, redaction), gestion d'erreurs | S | INF-01 | Aucun secret dans les logs (test) |
| PLT-02 | i18n : `next-intl`, fr/de/en, règle « pas de chaîne en dur », test de parité des clés | S | INF-01 | Page d'accueil dans les 3 langues ; parité vérifiée en CI |
| PLT-03 | En-têtes de sécurité (CSP nonce, HSTS, etc.), `/healthz`, limitation de débit en base (squelette) | M | INF-03, DB-01 | Scan d'en-têtes conforme ; 429 au-delà du seuil |
| PLT-04 | Jobs : pg-boss, outbox transactionnelle, worker `ROLE=all`, job de test | M | DB-01 | Job exécuté une fois même après redémarrage ; payload sans `tenantId` rejeté |
| OPS-01 *(reporté inc. 0b)* | Spike hébergement : compte PaaS UE, hello-world conteneur + Postgres + S3 + DPA ; vérifier prix, PITR, sauvegardes (ADR-0007) | M | INF-03 | Rapport ; ADR-0007 passé en « accepté » ou remplacé |
| OPS-02 *(reporté inc. 0b)* | Déploiement staging automatique (build, migrations, smoke tests, rollback) | L → découper (OPS-02a pipeline, OPS-02b smoke tests + rollback) | OPS-01, INF-04 | Merge sur `main` ⇒ staging à jour ; échec smoke ⇒ retour arrière |
| OPS-03 | Runbook et **test de restauration** (`docs/runbooks/restore.md`), exécuté sur environnement jetable | M | OPS-01 | Restauration réussie, durée mesurée, résultat consigné |
| OPS-04 *(reporté inc. 0b)* | Gestion des secrets : environnements GitHub `staging`/`production`, rotation documentée, approbation manuelle prod | S | INF-02, OPS-01 | Déploiement prod bloqué sans approbation |
| DOC-01 | Squelette `docs/specs/`, gabarit de spec, gabarit ADR, rétro, mise en place `.claude/commands` et sous-agents | S | INF-01 | Gabarits présents ; `/spec` fonctionne |

**Définition de fin d'incrément 0 (local, voir SPEC-000 §7)** : CI verte et bloquante (dont isolation), restauration testée en local, rétrospective faite. **Incrément 0b** (dès qu'un compte PaaS et un domaine existent) : OPS-01, OPS-02, OPS-04, ADR-0007 tranché, restauration rejouée sur le PaaS.

## Incrément 1 – Identité, organisations, organes, rôles (SPEC-001…004)

| ID | Titre | Taille | Dép. | CA clés (extraits) |
|---|---|---|---|---|
| ID-01 | Modèle `user`, `session`, `tenant`, `membership` + RLS + migrations | M | DB-02 | Un `user` peut avoir 2 `membership` ; accès au tenant B refusé avec session sur A |
| ID-02 | Inscription : création d'un utilisateur et d'une organisation (premier admin), vérification d'e-mail | M | ID-01, PLT-04 | Lien de vérification à usage unique ; e-mail localisé |
| ID-03 | Login/logout, hachage Argon2id, sessions opaques, expiration, liste et révocation des sessions | M | ID-01 | Cookie `__Host-` HttpOnly ; session révoquée refusée ; message d'erreur identique pour compte inconnu |
| ID-04 | Protection anti-force brute et limitation de débit login | S | ID-03, PLT-03 | 6ᵉ tentative en 1 min ⇒ 429 ; délai progressif |
| ID-05 | MFA TOTP : enrôlement, codes de secours, vérification, obligation par rôle (paramètre tenant) | M | ID-03 | Secret chiffré en base ; code réutilisé refusé ; connexion sans TOTP refusée si imposé |
| ID-06 | Réinitialisation du mot de passe (jeton 1 h, usage unique) | S | ID-03 | Jeton réutilisé ⇒ refus ; sessions existantes révoquées |
| ID-07 | Sélecteur d'organisation et tenant actif en session (revalidation à chaque requête) | S | ID-03 | Suppression d'appartenance ⇒ accès coupé immédiatement |
| TEN-01 | Paramètres du tenant (nom, langue, fuseau, imposer MFA) | S | ID-01 | Réservé à `org_admin` ; audit émis |
| TEN-02 | Invitation d'utilisateurs par e-mail (jeton, expiration, renvoi, annulation), rattachement multi-organisations | M | ID-02, ID-07 | Invité existant ⇒ simple appartenance ; invitation expirée refusée |
| BOD-01 | Organes : CRUD (nom, type, règles de quorum/majorité, référence statutaire) | M | ID-01 | Réservé à `org_admin` ; isolation testée |
| BOD-02 | Mandats : attribution/clôture (rôle d'organe, dates, droit de vote), composition à une date | M | BOD-01, TEN-02 | Composition au jour J exacte ; chevauchements contrôlés |
| AZ-01 | Module `authz.can` + politiques par module + **génération des tests de refus depuis la matrice** `04` | L → découper (AZ-01a moteur, AZ-01b générateur de tests) | BOD-02 | Chaque action × rôle testée ; refus par défaut |
| AUD-01 | Journal d'audit append-only : table, triggers, `REVOKE`, hash chaîné, API d'écriture ; événements de connexion, rôle, mandat, invitation | M | ID-01 | UPDATE/DELETE impossibles ; `verify:chain` détecte une altération |
| UI-01 | Gabarit d'application : navigation, sélecteur de langue, accessibilité de base, pages d'erreur | M | PLT-02 | Parcours clavier ; contraste AA ; 3 langues |
| E2E-01 | Parcours e2e : inscription ⇒ organisation ⇒ organe ⇒ invitation ⇒ mandat ⇒ login MFA | M | tout l'incrément | Parcours vert en CI (Playwright) |
| ISO-01 | Extension de la suite d'isolation à toutes les tables de l'incrément 1 + test d'IDOR sur invitations et mandats | S | TST-01 | Aucune lecture inter-tenants |

**Définition de fin d'incrément 1** : un admin crée une organisation et un organe, invite un secrétaire (MFA activé) qui se connecte ; matrice de droits testée ; audit chaîné vérifié ; rétrospective faite.

## Ordre de traitement recommandé
Inc. 0 : INF-01 → INF-02 → INF-03 → DB-01 → DB-02 → TST-01 → INF-04 → INF-05 → PLT-01…04 → OPS-01 → OPS-02 → OPS-03 → OPS-04 → DOC-01.
Inc. 1 : ID-01 → AUD-01 → ID-02 → ID-03 → ID-04 → ID-05 → ID-06 → ID-07 → TEN-01 → TEN-02 → BOD-01 → BOD-02 → AZ-01 → UI-01 → E2E-01 → ISO-01.
