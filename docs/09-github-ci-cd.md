# 09 – GitHub : dépôt, conventions, CI/CD, environnements

## 1. Décision préalable : dépôt privé ou public ? (impact sur les coûts)

À **vérifier sur la page de tarification GitHub** avant de choisir ; l'état connu est le suivant :

| Fonction | Dépôt public | Dépôt privé |
|---|---|---|
| Branches protégées, PR, checks requis | Gratuit | Offre payante (GitHub Pro/Team) requise pour appliquer la protection |
| Dependabot (alertes + mises à jour) | Gratuit | Gratuit |
| CodeQL, secret scanning | Gratuit | Nécessite GitHub Code Security / Secret Protection (payant) |
| Environnements avec approbation manuelle | Gratuit | Pro/Team/Enterprise |
| GitHub Actions | Minutes gratuites illimitées | Quota mensuel (puis facturé) |

**DÉCISION (2026-11-12) : dépôt public** (compte gratuit) ; toutes les fonctions du tableau sont alors gratuites. Le texte ci-dessous reste valable en cas de passage au privé.

**RECO initiale (remplacée)** : dépôt **privé** (le produit sera commercial) avec **GitHub Pro/Team** (quelques USD/mois). Si CodeQL/secret scanning natifs sont trop chers : **Semgrep CE + gitleaks + `pnpm audit` + OSV-Scanner** exécutés dans Actions (équivalent fonctionnel, gratuit). Le choix est tranché en issue `INF-02`.

**Particularité solo** : GitHub n'autorise pas l'auteur à approuver sa propre PR. Règle retenue : **PR obligatoire, 0 approbation requise, checks requis, aucune exception pour les administrateurs**, plus une **checklist humaine dans le template de PR** et une revue automatisée (`/code-review` de Claude Code, CodeQL) tracée en commentaire. Dès qu'une 2ᵉ personne rejoint : 1 approbation requise + CODEOWNERS.

## 2. Structure du dépôt

```
/
├── CLAUDE.md                     # règles pour l'agent (racine)
├── README.md
├── CHANGELOG.md                  # généré par release-please
├── package.json  pnpm-lock.yaml  tsconfig.json  next.config.ts
├── Dockerfile  docker-compose.yml
├── .github/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/ (feature.yml, bug.yml, spike.yml, config.yml)
│   └── workflows/ (ci.yml, security.yml, deploy-staging.yml, deploy-production.yml, release.yml)
├── docs/
│   ├── 00 … 12 (ces livrables)
│   ├── adr/                      # décisions d'architecture
│   ├── specs/                    # une spec par fonctionnalité : SPEC-001-….md
│   ├── runbooks/                 # restore.md, rotate-secrets.md, incident.md
│   └── retro/                    # rétrospectives par incrément
├── src/
│   ├── app/                      # Next.js : pages, layouts, routes (glue uniquement)
│   ├── modules/                  # un dossier par module métier (identity, tenancy, bodies, meetings, agenda, minutes, decisions, risks, actions, documents, governance, audit, notifications)
│   │   └── <module>/ { index.ts, service.ts, repo.ts, schema.ts, policy.ts, *.test.ts }
│   ├── platform/                 # db (withTenant), authz, auth, jobs, storage, mail, pdf, search, i18n, ratelimit
│   └── messages/                 # fr.json, de.json, en.json
├── db/
│   ├── migrations/               # SQL versionné (expand/contract)
│   └── policies/                 # RLS, triggers d'immutabilité
├── tests/
│   ├── isolation/                # tests inter-tenants (bloquants)
│   ├── authz/                    # matrice de droits générée
│   ├── e2e/                      # Playwright
│   └── fixtures/
└── scripts/                      # verify-chain, seed, db-reset
```

## 3. Conventions

- **Branches** : `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/…`, `docs/…`. Une issue = une branche = une PR.
- **Commits** : Conventional Commits (`feat(minutes): …`, `fix(authz): …`), validés par `commitlint` ; `BREAKING CHANGE:` en pied si nécessaire ; référence `Refs #123`.
- **PR** : titre = commit de squash ; **taille cible < 400 lignes** de diff hors migrations et tests ; liée à la spec (`SPEC-xxx`) et à l'issue (`Closes #n`) ; squash merge uniquement.
- **Versions** : SemVer ; **release-please** crée la PR de release et le changelog depuis les commits ; tag `vX.Y.Z` déclenche la production.
- **Étiquettes (labels)** : `type:feature|bug|spike|chore|security`, `module:<nom>`, `inc:0..7`, `size:S|M|L`, `gate:spec-ok|plan-ok`, `needs:spec`.
- **GitHub Projects** : tableau « Comités » avec colonnes `Backlog → Spec à valider → Prêt (DoR) → En cours → En revue → Staging → Fait`, champs `Incrément`, `Taille`, `Module`, `Spec`.

## 4. Protection de la branche `main` (réglages)

- Require a pull request before merging ; require status checks (`lint`, `typecheck`, `unit`, `integration`, `isolation`, `e2e`, `security`, `build`) ; require branches up to date ; require conversation resolution ; require linear history ; **pas de force-push, pas de suppression** ; « Do not allow bypassing » ; signatures de commit requises (vigilance : GPG/SSH).
- Règles d'environnement : `staging` (déploiement auto depuis `main`) ; `production` (**reviewer requis = vous**, wait timer 0, branche/tag `v*` uniquement).
- Secrets : au niveau **environnement** (`staging`, `production`), jamais au niveau dépôt pour la production.

## 5. Workflows GitHub Actions (squelettes)

**`ci.yml`** : déclenché sur PR et `main`. Toutes les actions **épinglées par SHA**, `permissions: contents: read` par défaut.

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - run: pnpm lint && pnpm typecheck && pnpm depcruise
      - run: pnpm i18n:check            # parité fr/de/en
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: ci }, ports: ['5432:5432'], options: >-
        --health-cmd pg_isready --health-interval 5s --health-retries 10 }
    steps:
      - # checkout, setup (idem)
      - run: pnpm db:migrate
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm test:isolation        # BLOQUANT : aucun merge si rouge
      - run: pnpm test:authz            # matrice de droits
  e2e:
    needs: [quality]
    runs-on: ubuntu-latest
    steps:
      - # setup + docker compose up
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
  build:
    needs: [quality, test]
    runs-on: ubuntu-latest
    steps:
      - run: docker build -t app:ci .
      - run: pnpm sbom                  # CycloneDX
```

**`security.yml`** : PR + planifié hebdomadaire : `codeql-action` (ou Semgrep), `gitleaks`, `pnpm audit --prod`, `osv-scanner`, `dependency-review-action`, scan d'image `trivy` ; échec sur sévérité ≥ élevée.

**`deploy-staging.yml`** : sur push `main` ⇒ build image ⇒ publication dans le registre (GHCR) ⇒ job `migrate` (migrations **avant** démarrage, rétrocompatibles) ⇒ déploiement vers le PaaS ⇒ **smoke tests** (`/healthz`, login de test, isolation) ⇒ rollback automatique si échec.

**`deploy-production.yml`** : sur tag `v*` ou `workflow_dispatch` ⇒ `environment: production` (**approbation manuelle**) ⇒ même image que staging (promotion de l'image, pas de rebuild) ⇒ sauvegarde déclenchée avant migration ⇒ migrations ⇒ déploiement ⇒ smoke tests ⇒ notification.

**`release.yml`** : release-please ⇒ PR « chore(main): release x.y.z » ⇒ à la fusion : tag, GitHub Release avec notes, SBOM en pièce jointe.

**`dependabot.yml`** : écosystèmes `npm`, `github-actions`, `docker`, hebdomadaire, regroupement des mises à jour mineures.

## 6. Stratégie d'environnements

| Environnement | Données | Déploiement | Accès |
|---|---|---|---|
| Local | Synthétiques (seed) | `docker compose up` | Développeur |
| CI | Éphémères | À chaque PR | Automatique |
| Staging | **Synthétiques uniquement** | Auto sur `main` | Développeur |
| Production | Réelles | Tag + approbation manuelle | Utilisateurs |

Migrations : **expand/contract** (ajout compatible → déploiement → bascule → suppression à l'incrément suivant). Aucune migration destructive sans sauvegarde préalable et approbation.

## 7. Templates

### `.github/PULL_REQUEST_TEMPLATE.md`
```markdown
## Quoi / pourquoi
Closes #  · Spec : docs/specs/SPEC-___.md · ADR (si applicable) :

## Changements
-

## Preuves
- [ ] Critères d'acceptation de la spec couverts par des tests (liste ci-dessous)
- [ ] Tests unitaires / intégration / e2e verts
- [ ] Tests d'isolation tenant et de droits ajoutés ou mis à jour
- [ ] Captures d'écran (FR/DE/EN si UI)

## Garde-fous (cocher ou justifier)
- [ ] Nouvelle table : `tenant_id` + RLS FORCE + politique + test d'isolation
- [ ] Aucun secret, aucune donnée réelle dans le diff
- [ ] Textes UI dans les 3 langues
- [ ] Événements d'audit émis pour les actions sensibles
- [ ] Migration rétrocompatible (expand/contract)
- [ ] CLAUDE.md / docs / ADR mis à jour si une règle ou un choix a changé

## Gate G3 (revue humaine)
- [ ] J'ai relu le diff ligne à ligne ; revue /code-review exécutée : résultat :
```

### `.github/ISSUE_TEMPLATE/feature.yml` (champs)
`Spec liée` (obligatoire) · `User story` (En tant que … je veux … afin de …) · `Critères d'acceptation` (Given/When/Then) · `Hors périmètre` · `Modules touchés` · `Taille (S/M/L)` · `Risques sécurité/isolation`. Les formulaires `bug.yml` (étapes, attendu/obtenu, tenant concerné, gravité) et `spike.yml` (question, timebox, livrable) suivent le même principe.

### `CODEOWNERS`
```
*                      @<votre-login>
/db/                   @<votre-login>
/src/platform/authz/   @<votre-login>
/.github/              @<votre-login>
```
