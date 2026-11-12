# ADR-0006 – Immutabilité : triggers, versions, hash chaîné

- Statut : proposé
- Date : 2026-11-12

## Contexte
PV approuvés et décisions doivent être non modifiables ; traçabilité qui/quand/quoi. Sans signature qualifiée (FAIT), la **preuve d'intégrité** repose sur la base et sur des empreintes.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Contrôles applicatifs seuls** | Simple | Contournables par un bug ou un accès SQL |
| B. **Triggers PostgreSQL + `REVOKE` + versions + hash chaîné** | Garanti par la base, vérifiable | Un peu plus de SQL à maintenir |
| C. Blockchain / horodatage qualifié tiers | Preuve forte opposable | Coût, complexité, hors MVP |

## Décision
Option B :

- `BEFORE UPDATE OR DELETE` sur `approval`, `audit_log`, `minutes_version` (si `locked_at` non nul), `decision` (hors colonne `status` modifiée par fonction dédiée `SECURITY DEFINER`), `ballot` d'un vote clos : lève une exception.
- `REVOKE UPDATE, DELETE, TRUNCATE` sur ces tables pour `app_rw`.
- Hash : SHA-256 du **contenu canonique** (JSON à clés triées, UTF-8 NFC). `minutes_version.prev_hash` chaîne les versions ; `audit_log.hash = SHA256(prev_hash || contenu)` par tenant.
- Le PDF d'une version verrouillée est conservé avec son hash ; le rendu est déterministe (mêmes données ⇒ même PDF) pour pouvoir le revérifier.
- Commande de vérification `pnpm verify:chain <tenant>` et job hebdomadaire d'**auto-vérification** (alerte en cas d'incohérence).
- Évolution V2 : horodatage qualifié RFC 3161 du hash (option C partielle).

## Conséquences
- Une correction de contenu approuvé passe par un rectificatif (nouvelle version) ou une nouvelle décision, jamais par UPDATE.
- Le droit à l'effacement (RGPD/nLPD) est traité par **anonymisation des personnes** référencées et non par suppression de la ligne ; voir `08-conformite.md`. Pour ne pas casser les hash, le contenu canonique référence des identifiants stables et non les noms en clair, résolus à l'affichage.
