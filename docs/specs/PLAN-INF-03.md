# PLAN-INF-03 – Environnement local Docker

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC15, AC16 ; AC17 en partie) · Issue : INF-03 · Taille : M
- Branche : `chore/inf-03-docker` · Dépend de : INF-01 (fait)

## 1. Périmètre
Un `docker compose up` local fournit **PostgreSQL, un S3 de test et un SMTP de test**, plus une **image applicative** minimale, non root, qui répond sur `/healthz`. Pas de rôles SQL ni de RLS (DB-01), pas de Next.js (PLT-03), pas d'envoi réel d'e-mails.

## 2. Décision à valider : que contient l'image tant que Next.js n'existe pas ?
| Option | Pour | Contre |
|---|---|---|
| **A. Mini serveur `node:http` (`src/platform/health-server.ts`) avec `/healthz`, remplacé par Next.js en PLT-03** | Valide dès maintenant le Dockerfile (utilisateur non root, taille, healthcheck) ; Node 24 exécute le TypeScript directement (type stripping), donc pas d'étape de build | Code jetable (~20 lignes) |
| B. Reporter le Dockerfile à PLT-03 | Aucun code jetable | AC15/AC16 non validés dans cet incrément ; le Dockerfile arrive en même temps que Next.js (PR plus grosse, risque plus élevé) |

**RECO : A.**

## 3. Fichiers
| Fichier | Contenu |
|---|---|
| `docker-compose.yml` | Services `db` (PostgreSQL 16), `s3` (stockage objet), `mailpit` (SMTP + interface web), `app` (profil `app`, optionnel) ; volumes nommés ; healthchecks ; ports publiés **uniquement sur `127.0.0.1`** |
| `Dockerfile` | Multi-étapes : `deps` (`pnpm install --frozen-lockfile --prod`) → `runtime` (`node:24-slim`, `USER node`, `HEALTHCHECK`, pas de pnpm ni d'outils de build) |
| `.dockerignore` | `.git`, `node_modules`, `.env*`, `docs`, `tests`, `coverage` |
| `.gitattributes` | `* text=auto eol=lf` (évite les scripts shell cassés par CRLF sous Windows) |
| `src/platform/health-server.ts` + test | Serveur `/healthz` (réponse JSON `{status:"ok"}`), port via configuration |
| `src/platform/config.ts` + test | Configuration typée par Zod (ajout de la dépendance `zod`) : `DATABASE_URL`, `PORT`, `S3_*`, `SMTP_*` ; échec explicite si variable manquante (AC17) |
| `.env.example` | Complété : valeurs **factices** et ports |
| `db/init/.gitkeep` | Dossier monté dans `docker-entrypoint-initdb.d` (rempli par DB-01) |
| `scripts/docker-smoke.sh` | Vérifie AC15/AC16 (voir §4) |
| `package.json` | Scripts : `docker:up` (`up -d --wait`), `docker:down`, `docker:reset` (supprime les volumes), `test:docker` (smoke) |
| `README.md` | Section « Environnement local » |

## 4. Tests / preuves
- **AC15** : `pnpm docker:up` puis `/healthz` du conteneur `app` répond 200 ; PostgreSQL accepte une connexion ; S3 : création d'un bucket et dépôt d'un objet ; Mailpit : un message de test envoyé en SMTP apparaît dans son API.
- **AC16** : l'image tourne avec un UID ≠ 0 ; aucun fichier `.env` ni secret dans l'image (inspection du contenu) ; taille < 300 Mo.
- **AC17** : test unitaire de `config.ts` : variable obligatoire absente ⇒ erreur nommant la variable.
- Les tests Docker sont **séparés** de `pnpm test` (`pnpm test:docker`, jouée en CI par INF-04) pour ne pas exiger Docker sur chaque exécution.
- Je donne le résultat réel de chaque commande dans la PR ; ce que je ne peux pas vérifier (ex. Docker indisponible) sera dit explicitement.

## 5. Risques
- **Docker Desktop n'est pas démarré** (constaté le 2026-11-12 : le client Docker 29.5.3 et Compose 5.1.4 sont installés mais le démon ne répond pas). Il doit tourner avant l'exécution ; sinon je ne pourrai pas prouver AC15/AC16 et je le dirai explicitement.
- **Image S3 locale** : MinIO a changé sa politique de distribution d'images communautaires (à vérifier au moment de l'exécution). Candidats : **Garage**, **SeaweedFS** ou **RustFS**, tous compatibles S3. Je fais un essai de 15 minutes et je choisis celui qui démarre proprement avec un bucket créé automatiquement ; le choix est consigné dans la PR (et en ADR si ce n'est pas MinIO).
- **Identifiants** : tous factices et publics (dépôt public) ; l'application locale n'écoute que sur `127.0.0.1`. Aucun de ces identifiants ne doit servir ailleurs.
- **Windows** : fins de ligne (`.gitattributes`), chemins ; je teste depuis votre machine.
- **Versions** : images épinglées par tag majeur + digest relevé à l'exécution ; les mises à jour passent par Dependabot (INF-05).
- **Ports** : conflit possible avec un PostgreSQL local déjà installé ⇒ ports configurables (`DB_PORT`, défaut 5432).

## 6. Hors périmètre
Rôles `app_migrator`/`app_rw`, migrations, RLS (DB-01/02) ; Next.js, en-têtes de sécurité, limitation de débit (PLT-03) ; déploiement PaaS (incrément 0b) ; CI Docker (INF-04).

## 7. Questions pour G2
1. Option A (mini serveur `/healthz` jetable) ou B (reporter le Dockerfile) ?
2. Ajout de la dépendance `zod` dès cette PR (configuration validée) : OK ?
3. S3 local : j'essaie MinIO d'abord puis une alternative si indisponible : OK, ou vous préférez une alternative d'emblée ?
