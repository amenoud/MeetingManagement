# PLAN-INF-01 – Initialiser le dépôt et l'outillage

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC1, AC2, AC6 en partie) · Issue : INF-01 · Taille : M
- Branche : `chore/inf-01-tooling`

## 0. Ordre de mise en place (avant INF-01)
1. **Commit initial des docs sur `main`** (une seule fois, avant toute protection) : `docs: initial framing (specs, ADR, CLAUDE.md)`.
2. Créer le dépôt GitHub **public** `MeetingManagement`, pousser `main` (INF-02 partiel).
3. Activer la protection de `main` (PR requise, checks requis une fois la CI créée, pas de force-push, pas de contournement).
4. INF-01 se fait ensuite **par PR**, comme toutes les suivantes.

## 1. Périmètre
Outillage uniquement : pas de Next.js, pas de base, pas de Docker (issues suivantes). Un projet TypeScript strict avec la structure de modules, vérifiable par `pnpm lint && pnpm typecheck && pnpm test`.

## 2. Fichiers créés
| Fichier | Contenu |
|---|---|
| `package.json` | `private: true`, `engines`, scripts : `lint`, `format`, `typecheck`, `test`, `test:unit`, `depcruise`, `prepare` |
| `pnpm-lock.yaml`, `.npmrc` | `ignore-scripts=true` par défaut, `engine-strict=true` |
| `.nvmrc` | Node LTS en cours (à confirmer au moment de l'exécution) |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, alias `@/*` |
| `eslint.config.js` | typescript-eslint (règles strictes), `no-explicit-any`, interdiction de `@ts-ignore` sans description, interdiction d'importer le contenu interne d'un module |
| `.prettierrc`, `.editorconfig` | Formatage |
| `vitest.config.ts` | Tests unitaires, seuil de couverture 80 % sur `src/modules/**` |
| `.dependency-cruiser.cjs` | Règle : un module n'importe que `index.ts` d'un autre ; `platform` n'importe pas `modules` |
| `commitlint.config.js` | Conventional Commits, types autorisés, scopes = modules |
| `.husky/` | `pre-commit` (lint-staged), `commit-msg` (commitlint), `pre-push` (refuse le push direct sur `main`) |
| `.gitignore` | `node_modules`, `.env*` sauf `.env.example`, builds, couverture |
| `.env.example` | Variables documentées, **valeurs factices uniquement** |
| `src/modules/.gitkeep`, `src/platform/.gitkeep`, `src/messages/` | Structure cible (ADR-0001) |
| `src/platform/version.ts` + test | Fonction témoin pour prouver la chaîne lint/types/test |
| `README.md` | Démarrage, scripts, lien vers `docs/` et `CLAUDE.md` |
| `LICENSE` | Voir question 1 |

## 3. Tests (critères d'acceptation)
- **AC1** : sur un clone vierge, `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` passe (je l'exécute et je donne le résultat).
- **AC2** : `git commit -m "bad message"` est refusé ; `git commit -m "chore: test"` passe.
- Test du hook `pre-push` : push sur `main` refusé en local.
- Test de la règle `depcruise` : un import interdit factice fait échouer la commande (cas négatif en test).

## 4. Risques et décisions
- **Dépôt public** : `.env.example` sans aucune vraie valeur ; `gitleaks` en pre-commit (ajouté à INF-05, un simple contrôle de motifs en attendant).
- `ignore-scripts=true` peut casser certains paquets : on liste les exceptions explicitement.
- Versions des outils : j'utilise les dernières stables **au moment de l'exécution** et je les fige par lockfile ; je ne les connais pas d'avance.
- Taille de la PR : ~300 lignes de config, hors lockfile.

## 5. Questions pour G2
1. **Licence** : **DÉCIDÉ (2026-11-12) : tous droits réservés**, avec un `LICENSE` explicite « Copyright © <année> <titulaire>. All rights reserved. » (le titulaire reste à confirmer). Options étudiées : (a) aucune licence = tous droits réservés (par défaut légal, **recommandé** : le code reste visible mais non réutilisable), (b) licence propriétaire explicite « All rights reserved », (c) open source (MIT/AGPL) : irréversible pour le code déjà publié. Décision à prendre avant le premier push public.
2. **Identité Git** (nom + e-mail pour les commits) : l'e-mail des commits sera **public** ; utiliser l'adresse `noreply` GitHub (recommandé) plutôt que votre e-mail personnel ?
3. **GitHub CLI** (`gh`) : est-il installé et connecté sur votre machine ? Sinon je vous donnerai les commandes à exécuter vous-même pour créer le dépôt.
4. Les **docs de sécurité** (modèle de menaces, plan) seront publiques : acceptable, ou les garder hors dépôt public jusqu'à l'ouverture commerciale ?
