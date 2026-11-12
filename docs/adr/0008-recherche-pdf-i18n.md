# ADR-0008 – Recherche plein texte, génération PDF, internationalisation

- Statut : proposé
- Date : 2026-11-12

## 1. Recherche plein texte
| Option | Verdict |
|---|---|
| **PostgreSQL FTS** (`tsvector`, GIN, `unaccent`, configs `french`/`german`/`english` choisies par langue de la ligne) | **Retenue** : aucun service en plus, isolation garantie par la RLS |
| Meilisearch / Elasticsearch | Écartée au MVP : service à isoler par tenant, coût, risque de fuite |

Colonne `search tsvector` générée sur `decision.text` et `title`, `agenda_item`, `minutes_version`. Requêtes via `websearch_to_tsquery`. Surlignage `ts_headline`. Évolution possible vers `pg_trgm` pour la tolérance aux fautes.

## 2. Génération de PDF
| Option | Pour | Contre |
|---|---|---|
| **`@react-pdf/renderer`** | Pure Node, pas de navigateur, déterministe, léger | Mise en page moins riche que HTML/CSS, pas de PDF/A natif |
| Playwright/Chromium headless | Rendu HTML fidèle | Image Docker lourde, mémoire, surface d'attaque |
| Service externe | – | Hors périmètre (données sensibles) |

**Retenue : `@react-pdf/renderer`**, polices embarquées (couvrant FR/DE/EN, y compris trémas), gabarit unique pour le PV avec en-tête, liste de présence, quorum, points, décisions, votes, annexes, pied de page avec version et hash, **bloc de signature vide**. Archivage PDF/A : plus tard (V2), éventuellement par post-traitement.

## 3. Internationalisation
`next-intl`, langues `fr` (défaut), `de`, `en`. Messages dans `messages/{locale}.json`, clés hiérarchiques, **aucune chaîne en dur dans l'UI** (règle ESLint `no-literal-string`), pluriels ICU, formats de date et nombres via `Intl` (fuseau `Europe/Zurich` par défaut, réglable par séance). Langue : préférence utilisateur, repli sur celle du tenant. E-mails, `.ics` (`SUMMARY`/`DESCRIPTION`), PDF : localisés dans la langue du destinataire (convocation) ou du tenant (PV). Test CI : parité des clés entre les 3 langues.
