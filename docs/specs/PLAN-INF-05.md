# PLAN-INF-05 – Sécurité de la chaîne de développement

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC5 ; renforce AC6, AC16) · ADR-0006/`07-menaces-securite.md` (chaîne d'approvisionnement) · Issue : INF-05 · Taille : M
- Branche : `ci/inf-05-security` · Dépend de : INF-04 (fait)

## 1. État constaté le 2026-11-12 (dépôt public `amenoud/MeetingManagement`)
| Fonction GitHub | État |
|---|---|
| Secret scanning + push protection | **Activés** (gratuits en public) |
| Alertes Dependabot | **Désactivées** (l'API renvoie 404) |
| Mises à jour de sécurité Dependabot | **Désactivées** |
| Signalement privé de vulnérabilités | **Désactivé** |
| CodeQL (réglage par défaut) | **Non configuré** |
| `pnpm audit --prod` | Aucune vulnérabilité connue |

## 2. Périmètre
Ajouter les contrôles de sécurité automatiques, les rendre visibles et (pour les plus fiables) obligatoires. Hors périmètre : tests d'isolation (TST-01), antivirus, DAST, pentest, SAST sur règles métier personnalisées.

## 3. Éléments

### 3.1 Workflow `security.yml` (nouveau, séparé de `ci.yml`)
Déclencheurs : `pull_request`, `push` sur `main`, **planifié hebdomadaire** (lundi) et `workflow_dispatch`. Permissions par défaut `contents: read` ; `security-events: write` **uniquement** sur le job CodeQL.

| Job | Outil | Échec si |
|---|---|---|
| `secrets` | **gitleaks** (image Docker épinglée par digest) sur tout l'historique de la PR | secret détecté (**AC5** : preuve par un faux secret) |
| `deps` | `pnpm audit --prod --audit-level=high` + `dependency-review-action` (PR) | vulnérabilité ≥ élevée ou licence non autorisée |
| `codeql` | CodeQL, langage `javascript-typescript`, requêtes `security-extended` | alerte de sévérité élevée |
| `image` | **Trivy** sur l'image Docker construite (vulnérabilités OS et bibliothèques, secrets) | sévérité CRITICAL (HIGH signalé seulement au départ) |

Toutes les actions épinglées par SHA (contrôle `check:actions` déjà en place) ; images Docker par digest.

### 3.2 Dependabot (`.github/dependabot.yml`)
Écosystèmes : `npm`, `github-actions`, `docker` (Dockerfile) et `docker-compose`. Fréquence hebdomadaire, regroupement des mises à jour mineures/correctifs, limite de PR ouvertes (5), préfixe de commit conforme (`chore(deps): …`). Les SHA d'actions et digests d'images sont ainsi maintenus.

### 3.3 Hook local `pre-commit` (gitleaks)
Vérification des fichiers indexés avant chaque commit (via l'image Docker si disponible ; sinon avertissement explicite, sans bloquer). Objectif : détecter **avant** le push (le dépôt est public).

### 3.4 Réglages du dépôt (changements de configuration, **avec votre accord**)
- Activer **alertes Dependabot** et **mises à jour de sécurité Dependabot**.
- Activer le **signalement privé de vulnérabilités**.
- Laisser le secret scanning et la push protection tels quels.

### 3.5 `SECURITY.md`
Politique de signalement (via le signalement privé GitHub), versions supportées (MVP : aucune version publique), engagement de réponse indicatif. Sans adresse e-mail personnelle (dépôt public).

### 3.6 Checks requis dans le ruleset
Après merge, ajout de `secrets`, `deps` et `codeql`. **`image` (Trivy) reste non requis** au départ (dépend de bases de vulnérabilités téléchargées, source d'instabilité) ; il sera requis après un mois sans faux positif bloquant. Changement du ruleset : avec votre accord explicite, puis preuve par PR jetable.

## 4. Tests / preuves
- **AC5** : une PR jetable contenant un **faux secret** (motif de test reconnu par gitleaks, jamais une vraie clé) fait échouer `secrets` ; la PR est fermée sans fusion. *Note : la push protection de GitHub peut bloquer le push du faux secret ; si c'est le cas, je le signale (c'est une preuve de plus) et j'utilise un motif que gitleaks reconnaît mais pas GitHub.*
- Exécution verte de `security.yml` sur la PR (liens et durées réels).
- `actionlint` et `check:actions` verts localement.
- Aperçu de la première série de PR Dependabot après activation.
- Pour tout contrôle que je ne peux pas prouver (ex. Trivy sur l'image), je le dis explicitement.
- Pour contourner un hook dans la preuve AC5, **je vous demanderai d'abord** (j'ai commis cette erreur à l'étape précédente) : je prévois de pousser le faux secret depuis un commit créé avec les hooks actifs, ce qui teste aussi le hook local.

## 5. Risques
- **Faux positifs** (gitleaks, Trivy, CodeQL) : fichier `.gitleaks.toml` avec liste d'exceptions **justifiées** (ex. identifiants factices de `docker-compose.yml`, qui sont des valeurs de dev publiques) ; chaque exception commentée.
- **Bruit Dependabot** : regroupement + limite de PR ; vous restez maître de la fusion (G3).
- **Dépendances externes** (bases de vulnérabilités) : `image` non bloquant au départ.
- **Chaîne d'approvisionnement des outils de sécurité eux-mêmes** : actions et images épinglées par SHA/digest, permissions minimales.
- **Durée de la CI** : les jobs tournent en parallèle ; objectif < 6 min.

## 6. Questions pour G2
1. Les **trois checks requis** (`secrets`, `deps`, `codeql`) et `image` non requis au départ : OK ?
2. J'active les **réglages du dépôt** du §3.4 (alertes, mises à jour de sécurité Dependabot, signalement privé) : OK ?
3. **Seuil Trivy** : bloquer seulement les CRITICAL au début : OK ?
