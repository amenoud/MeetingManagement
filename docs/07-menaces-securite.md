# 07 – Modèle de menaces (STRIDE) et plan de sécurité

Cible : OWASP ASVS **niveau 2**. Hors périmètre : sécurité physique du PaaS (déléguée, à documenter via leurs certifications).

## 1. Actifs à protéger

| Actif | Sensibilité | Propriété à garantir |
|---|---|---|
| PV, décisions, notes de séance | Élevée (secrets d'affaires, données personnelles) | Confidentialité, intégrité, non-répudiation |
| Registre des risques | Élevée | Confidentialité |
| Documents annexés | Élevée | Confidentialité, intégrité |
| Identifiants, secrets TOTP, sessions | Critique | Confidentialité |
| Journal d'audit | Élevée | Intégrité, disponibilité |
| Sauvegardes | Élevée | Confidentialité, disponibilité |

## 2. Frontières de confiance

Navigateur ⇄ application (Internet) · application ⇄ base · application ⇄ S3 · application ⇄ SMTP · GitHub Actions ⇄ PaaS · un tenant ⇄ un autre tenant (frontière **logique** la plus critique).

## 3. STRIDE appliqué

| Cat. | Menace concrète | Contre-mesure | Test / preuve |
|---|---|---|---|
| **S** Usurpation | Bourrage d'identifiants, phishing, détournement de session | Argon2id, limitation de débit, TOTP, cookies `__Host-` HttpOnly, rotation de session au login, ré-auth pour actions sensibles | Tests d'authentification, ASVS V2/V3 |
| S | Jeton d'invitation ou de réinitialisation deviné ou réutilisé | 256 bits, haché en base, usage unique, expiration | Test d'intégration |
| S | Usurpation de l'expéditeur des convocations | SPF/DKIM/DMARC, domaine dédié | Contrôle DNS en déploiement |
| **T** Altération | Modification d'un PV approuvé ou d'une décision | Triggers + REVOKE + hash chaîné (ADR-0006) | Test : tout UPDATE échoue, même avec `app_rw` |
| T | Altération d'un fichier annexé | SHA-256 par version, bucket privé, versioning | Vérification à la lecture |
| T | Injection SQL / XSS / SSRF | Requêtes paramétrées (Drizzle), Zod, échappement React, CSP stricte, pas de fetch d'URL fournie par l'utilisateur | Semgrep/CodeQL, tests |
| T | Altération des triggers par migration malveillante | Migrations révisées, `app_migrator` distinct, CI | Revue de PR |
| **R** Répudiation | « Je n'ai pas approuvé ce PV » | Journal d'audit chaîné, ré-auth + horodatage + empreinte attestée | Test d'audit sur chaque action sensible |
| **I** Divulgation | **Fuite inter-tenants** (RLS absente, `SET LOCAL` perdu, requête sans contexte) | ADR-0002, `FORCE RLS`, échec fermé, tests d'isolation bloquants | Suite d'isolation en CI |
| I | IDOR sur documents et PV | `authz.can` systématique + RLS + ACL ; identifiants UUID non devinables (non suffisants seuls) | Tests refus par rôle (générés depuis `04-roles-permissions.md`) |
| I | Fuite par logs, messages d'erreur, sauvegardes | Journaux sans contenu métier ni secrets, erreurs génériques, sauvegardes chiffrées chez le PaaS | Revue ; test de redaction |
| I | Fuite par e-mail transféré | Liens authentifiés vers annexes, pas de pièces jointes | Conception |
| I | Fuite par recherche/cache/jobs | FTS sous RLS, pas de cache partagé, `tenantId` obligatoire des jobs | Tests d'isolation étendus |
| I | Téléchargement d'un fichier actif (XSS stocké via fichier) | `attachment`, `nosniff`, liste blanche MIME, domaine de fichiers séparé si possible | Test d'upload |
| **D** Déni de service | Abus par un tenant bruyant, bourrage d'e-mails | Rate limiting par tenant et par IP (en base au MVP), quotas d'envoi et de taille | Test de charge léger |
| D | Perte de données | Sauvegardes quotidiennes + PITR, **restauration testée chaque trimestre** | Procédure `docs/runbooks/restore.md` exécutée avant la production |
| D | Verrouillage de compte par un tiers | Délai progressif plutôt que blocage dur | Test |
| **E** Élévation | Un membre agit en président ; un admin org lit le contenu des organes | `authz` centralisé, mandats datés, séparation des pouvoirs | Tests de matrice |
| E | Contournement de RLS par rôle SQL trop puissant | `app_rw` sans `BYPASSRLS` ; rôle de support séparé et journalisé | Test sur `pg_roles` |
| E | Chaîne d'approvisionnement (dépendance compromise, action GitHub compromise) | Lockfile, Dependabot, SBOM, actions épinglées par SHA, `pnpm audit`, scripts d'installation désactivés | CI sécurité |

## 4. Plan de sécurité

### Application (ASVS L2, principaux chapitres)
- **V1 Architecture** : ce document + ADR ; revue à chaque incrément.
- **V2 Authentification / V3 Sessions** : ADR-0003.
- **V4 Contrôle d'accès** : `authz` central, deny by default, tests de matrice.
- **V5 Validation** : Zod à toutes les frontières ; encodage de sortie ; PDF et `.ics` : échappement des champs.
- **V6 Cryptographie** : TLS 1.2+ partout ; chiffrement au repos fourni par PaaS (base, S3) ; secrets TOTP chiffrés applicativement (AES-256-GCM, clé dans variable d'environnement, rotation documentée) ; pas de cryptographie maison.
- **V7 Journalisation** : audit append-only + logs structurés sans PII sensibles.
- **V8 Protection des données** : minimisation, durées de conservation (`08-conformite.md`).
- **V9/V10/V12/V13/V14** : TLS, anti-malware (V2), fichiers, API, configuration.

### En-têtes et transport
`Strict-Transport-Security` (preload après stabilisation), `Content-Security-Policy` stricte avec nonce, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` restrictive, `frame-ancestors 'none'`, cookies `Secure`.

### Limitation de débit
Par IP et par tenant, en table PostgreSQL (fenêtre glissante) au MVP : login (5/min/compte), invitations, envois de convocation, téléversements, export. Réponses `429` avec `Retry-After`.

### Secrets
Jamais dans le code ni dans l'image. GitHub Secrets (par environnement) ⇒ variables d'environnement du PaaS. Rotation : trimestrielle et sur départ. `gitleaks` en CI et en pre-commit.

### Sauvegardes
Sauvegardes automatiques du PostgreSQL managé (quotidiennes + PITR si disponible) et versioning du bucket. **Objectifs** : RPO ≤ 24 h (≤ 15 min si PITR), RTO ≤ 4 h. Restauration testée sur un environnement jetable **avant la mise en production** puis chaque trimestre ; résultat consigné.

### Détection et réponse
Alertes : pics de 401/403/429, échecs de vérification de chaîne, jobs en échec, erreurs 5xx. Procédure de violation de données (`08-conformite.md` §6) : détection → qualification → notification PFPDT/autorité UE dans les délais (« dans les meilleurs délais » nLPD ; 72 h RGPD) → information des clients.

### Sécurité GitHub (résumé ; détails en `09-github-ci-cd.md`)
Branche `main` protégée, PR obligatoire, checks requis, Dependabot, CodeQL (ou alternative Semgrep), secret scanning (ou gitleaks), SBOM CycloneDX, actions épinglées, environnement `production` avec approbation manuelle.

## 5. Risques résiduels acceptés au MVP
Pas d'antivirus sur les fichiers ; pas de pentest externe ; pas de signature qualifiée ; limitation de débit sans pare-feu applicatif dédié ; MFA TOTP seul (pas de clé de sécurité). Chacun est revu avant l'ouverture commerciale.
