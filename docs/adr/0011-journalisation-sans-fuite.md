# ADR-0011 – Journalisation sans fuite : pino + masquage maison

- Statut : accepté (2026-11-14)
- Lié : `docs/specs/PLAN-PLT-01.md`, `docs/07-menaces-securite.md` (V7), `docs/08-conformite.md` (T8)

## Contexte
Les journaux sont la fuite la plus probable d'un produit qui manipule des PV et des données personnelles. Constats : une erreur Drizzle écrit le SQL et ses paramètres dans son message ; un jeton passé en paramètre d'URL finit dans un journal d'accès ; un message PostgreSQL peut contenir des valeurs.

## Options
| Option | Pour | Contre |
|---|---|---|
| **A. `pino` + fonction de masquage maison** | Standard, JSON sur stdout (PaaS), niveaux et enfants prêts ; la partie critique (masquage) reste notre code, testé seul | 1 dépendance |
| B. Logger maison sans dépendance | Contrôle total | À maintenir, réinvente niveaux/enfants/formats |

## Décision
**Option A.**
- Tout argument d'un appel de log passe par `scrub()` (`logMethod` de pino) : masquage **par clé** (mot de passe, jeton, cookie, `Authorization`…), **par valeur** (identifiants d'URL de connexion, `Bearer`/`Basic`, JWT, paramètres d'URL secrets, `clé=valeur` en texte libre, adresses e-mail, longues suites aléatoires hors UUID) et **clés de contenu** (`content`, `body`, `notes`, `text`, `html`, `minutes`…).
- Le contexte de requête (`request_id`, `tenant_id`, `user_id`) est ajouté automatiquement par `AsyncLocalStorage` ; un `request_id` entrant n'est repris que s'il respecte `^[A-Za-z0-9-]{8,64}$`.
- Les secrets de configuration sont enveloppés dans `Secret` (jamais imprimés) ; `process.env` n'est lu que dans `config.ts` (et la sélection des outils PostgreSQL) ; `console` est interdit dans `src/` (ESLint).
- Règle de fond, inscrite dans `CLAUDE.md` : **on journalise des identifiants, jamais du contenu**. Le masquage est un filet, pas le plan.

## Conséquences et limites assumées
- Un filet n'est jamais exhaustif : seuls les cas couverts par les tests sont garantis.
- Faux positifs visibles : une clé qui ressemble à un secret (`tokenCount`) est masquée par `[REDACTED]`, jamais supprimée en silence. Les hachages restent lisibles sous une clé `…hash`, `sha256`, `checksum`, `digest`.
- Les chemins de fichier dans les piles d'appels peuvent être partiellement masqués par la règle des longues suites : acceptable, visible.
- Les **bindings d'un logger enfant** (`log.child({...})`) ne sont pas masqués : ils doivent rester statiques et non sensibles.
- Erreurs PostgreSQL/Drizzle (journalisation par code seulement, réponse HTTP générique) : PLT-01b. Adresses IP : PLT-03.
