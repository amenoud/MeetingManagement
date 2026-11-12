# SPEC-000 – Socle technique (Incrément 0)

- Statut : **G1 validée sous réserve du point GitHub (§7)** – 2026-11-12
- Issues liées : INF-01…05, DB-01/02, TST-01, PLT-01…04, OPS-01…04, DOC-01 (voir `docs/12-backlog.md`)
- ADR liés : 0001, 0002, 0004, 0007, 0008
- Rôles concernés : développeur (vous) et agent ; aucun rôle métier

## 1. Objectif
Disposer d'un squelette déployable en continu où l'**isolation entre organisations**, la **CI bloquante** et la **restauration de sauvegarde** sont prouvées avant d'écrire la moindre fonctionnalité métier.

## 2. User stories techniques

- **US-1** En tant que développeur, je veux une CI qui bloque tout merge non conforme, afin de garantir la qualité sans relecture exhaustive.
- **US-2** En tant que développeur, je veux que toute table métier soit isolée par tenant par construction, afin qu'aucune fuite inter-organisations ne soit possible par oubli.
- **US-3** En tant que développeur, je veux un environnement local identique à la production (Postgres, S3, SMTP), afin de reproduire les bugs.
- **US-4** En tant que développeur, je veux un déploiement staging automatique, et un déploiement production soumis à approbation, afin de livrer sans risque.
- **US-5** En tant que futur exploitant, je veux avoir restauré une sauvegarde avant la production, afin de ne pas découvrir l'échec un jour d'incident.
- **US-6** En tant qu'utilisateur, je veux que l'interface existe dans les trois langues dès le départ, afin d'éviter une refonte i18n.
- **US-7** En tant que développeur, je veux que les e-mails et traitements différés soient fiables (outbox + jobs), afin de ne perdre aucune convocation.

## 3. Critères d'acceptation (Given / When / Then)

### Qualité et CI (INF-01, 04, 05)
- **SPEC-000-AC1** *Given* un dépôt cloné, *when* j'exécute `pnpm install && pnpm lint && pnpm typecheck && pnpm test`, *then* tout passe sur une machine vierge.
- **SPEC-000-AC2** *Given* un message de commit non conforme à Conventional Commits, *when* je commit, *then* le commit est refusé.
- **SPEC-000-AC3** *Given* une PR dont un check (lint, types, tests, isolation, sécurité, build) est rouge, *when* je tente de fusionner, *then* GitHub l'interdit.
- **SPEC-000-AC4** *Given* un push direct sur `main`, *then* il est refusé, y compris pour l'administrateur du dépôt.
- **SPEC-000-AC5** *Given* un secret factice commité dans une PR, *when* la CI tourne, *then* le job sécurité échoue.
- **SPEC-000-AC6** *Given* une action GitHub utilisée dans un workflow, *then* elle est épinglée par SHA (vérifié par un contrôle automatique).
- **SPEC-000-AC7** *Given* un build de CI, *then* un SBOM CycloneDX est produit et attaché.

### Isolation (DB-01, DB-02, TST-01)
- **SPEC-000-AC8** *Given* deux tenants A et B avec des lignes dans `probe`, *when* `withTenant(A)` lit la table, *then* seules les lignes de A sont retournées.
- **SPEC-000-AC9** *Given* une requête exécutée hors `withTenant`, *then* elle retourne 0 ligne et toute écriture échoue.
- **SPEC-000-AC10** *Given* `withTenant(A)`, *when* on tente d'insérer ou de modifier une ligne avec `tenant_id = B`, *then* la base rejette l'opération.
- **SPEC-000-AC11** *Given* une transaction `withTenant(A)` terminée puis une connexion du pool réutilisée par `withTenant(B)`, *then* aucune fuite de contexte n'est possible.
- **SPEC-000-AC12** *Given* le rôle `app_rw`, *then* il n'est ni superuser, ni propriétaire des tables, ni `BYPASSRLS`.
- **SPEC-000-AC13** *Given* une table portant `tenant_id` sans `FORCE ROW LEVEL SECURITY` et sans politique, *when* la suite d'isolation tourne, *then* elle échoue en nommant la table.
- **SPEC-000-AC14** *Given* une FK vers une ligne d'un autre tenant, *then* la contrainte composite la rejette.

### Environnement et plateforme (INF-03, PLT-01…04)
- **SPEC-000-AC15** *Given* `docker compose up`, *then* l'application, PostgreSQL, un S3 local et un SMTP de test sont joignables et `/healthz` répond 200.
- **SPEC-000-AC16** *Given* l'image Docker, *then* elle s'exécute en utilisateur non root et ne contient aucun secret.
- **SPEC-000-AC17** *Given* une variable d'environnement obligatoire manquante, *when* l'application démarre, *then* elle échoue avec un message explicite (configuration validée par Zod).
- **SPEC-000-AC18** *Given* une requête, *then* les logs contiennent `request_id` et `tenant_id` mais ni mot de passe, ni jeton, ni contenu de PV (test de redaction).
- **SPEC-000-AC19** *Given* une réponse HTTP, *then* elle porte CSP avec nonce, HSTS, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`.
- **SPEC-000-AC20** *Given* plus de N requêtes dans la fenêtre sur une route protégée, *then* la réponse est 429 avec `Retry-After`.
- **SPEC-000-AC21** *Given* l'application en `fr`, `de` ou `en`, *then* la page d'accueil s'affiche dans la langue choisie ; *given* une clé présente dans une langue et absente d'une autre, *then* la CI échoue.
- **SPEC-000-AC22** *Given* une action qui insère un job d'e-mail dans la même transaction, *when* la transaction échoue, *then* aucun job n'existe ; *when* elle réussit, *then* le job s'exécute exactement une fois même après un redémarrage du worker.
- **SPEC-000-AC23** *Given* un job sans `tenantId`, *then* il est rejeté.

### Déploiement et exploitation (OPS-01…04) – **reportés en incrément 0b** (voir §7), sauf AC27 adapté en local
- **SPEC-000-AC24** *Given* un merge sur `main`, *then* staging est mis à jour automatiquement, les migrations sont appliquées avant le démarrage et des smoke tests passent.
- **SPEC-000-AC25** *Given* des smoke tests en échec, *then* le déploiement est annulé et la version précédente reste active.
- **SPEC-000-AC26** *Given* un tag `v*`, *then* le déploiement production attend l'approbation manuelle de l'environnement `production` et réutilise l'image validée en staging.
- **SPEC-000-AC27** *(adapté local)* *Given* une base PostgreSQL Docker alimentée par le seed, *when* j'exécute `pnpm db:backup` puis `pnpm db:restore` dans une base jetable (procédure `docs/runbooks/restore.md`), *then* les données sont restaurées, un script de vérification (comptages + `verify:chain`) les valide, et la durée est consignée. La restauration sur le PaaS est rejouée en incrément 0b.
- **SPEC-000-AC28** *Given* un secret, *then* il n'existe que dans les secrets d'environnement GitHub et du PaaS, jamais dans le dépôt.

### Documentation (DOC-01)
- **SPEC-000-AC29** *Given* le dépôt, *then* il contient les gabarits de spec, d'ADR et de rétrospective, ainsi que les commandes `/spec`, `/plan`, `/review`.

## 4. Impacts
- **Données** : tables témoins `tenant` et `probe` (supprimées ou conservées en tests à l'incrément 1). Rôles SQL `app_migrator`, `app_rw`.
- **Audit** : hors périmètre de l'incrément (AUD-01 en incrément 1).
- **i18n** : clés d'accueil, erreurs génériques, en-têtes de navigation.
- **Sécurité** : en-têtes, limitation de débit, secrets, chaîne d'approvisionnement.

## 5. Hors périmètre
Toute fonctionnalité métier ; authentification (incrément 1) ; envoi réel d'e-mails en production (SMTP de test seulement) ; stockage de fichiers métier (S3 utilisé uniquement dans le spike OPS-01).

## 7. Décisions G1 (2026-11-12)

| # | Décision |
|---|---|
| 1 | Compte GitHub.com gratuit ⇒ **dépôt public** (décidé). Protection de `main`, CodeQL, secret scanning et environnements sont gratuits en public. Conséquence : tout le dépôt (code, specs, modèle de menaces) est visible ; **aucun secret ni donnée réelle, jamais** ; licence à choisir (voir plan INF-01) |
| 2 | Nom du produit et du dépôt : **MeetingManagement** (dépôt `MeetingManagement`) |
| 3 | Domaine **non défini** : staging/production et SPF/DKIM/DMARC reportés ; aucun e-mail réel avant décision |
| 4 | **Pas de compte PaaS pour l'instant, développement 100 % local** (Docker installé). OPS-01, OPS-02 (déploiement), OPS-04 (secrets d'environnement) et ADR-0007 sont reportés en **incrément 0b** ; AC24, AC25, AC26, AC28 reportés. Impact : on perd la validation précoce de l'hébergement ; risque faible car conteneur, Postgres et S3 sont standard |
| 5 | pnpm + Node LTS : oui |
| 6 | Couverture ≥ 80 % sur la logique métier modifiée : oui |

**GitHub (tranché : dépôt public)** : AC3/AC4 sont applicables sans frais. Migration vers un dépôt privé possible plus tard (GitHub Pro) avant commercialisation si l'on veut cacher le code ; les hooks locaux `pre-push` refusant `main` restent en filet de sécurité.

## 6. Questions ouvertes (traitées, voir §7)
1. **GitHub** : dépôt privé avec plan payant, ou public temporairement, ou privé avec Semgrep + gitleaks (INF-02) ?
2. **Nom du produit et du dépôt** (affecte domaine, e-mail d'envoi, identifiants GitHub).
3. **Nom de domaine** disponible pour staging et production (nécessaire pour SPF/DKIM/DMARC dès l'incrément 2) ?
4. **Compte PaaS** : acceptez-vous de créer un compte Clever Cloud pour le spike OPS-01 (aucune donnée réelle, quelques euros) ?
5. **Gestionnaire de paquets et Node** : pnpm + Node LTS (reco) : OK ?
6. **Couverture minimale** : 80 % sur la logique métier modifiée (DoD) : OK ?
