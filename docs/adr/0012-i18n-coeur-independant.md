# ADR-0012 – i18n : cœur indépendant du framework web

- Statut : accepté (2026-11-14)
- Complète : ADR-0008 §3 (next-intl, FR/DE/EN)
- Lié : `docs/specs/PLAN-PLT-02.md`, `docs/i18n.md`

## Contexte
ADR-0008 retient `next-intl`, qui exige Next.js. Or Next.js n'est pas encore installé (le choix du framework web accompagne PLT-03), et `use-intl` (le cœur de `next-intl`) exige `react` en dépendance de pair. Les messages d'erreur de l'API, les e-mails et les PDF ont besoin d'un traducteur qui ne dépende pas de React.

## Options
| Option | Pour | Contre |
|---|---|---|
| **A. Cœur léger sur `intl-messageformat` (ICU), réutilisable par `next-intl`** | Aucune dépendance à React/Next.js ; mêmes fichiers `fr/de/en.json` pour `next-intl` plus tard ; sert l'API, les e-mails et les PDF | ~100 lignes à maintenir ; léger écart possible avec `next-intl` sur les balises riches (interdites au départ) |
| B. Installer Next.js + `next-intl` maintenant | Une seule pile | PR énorme qui avale PLT-03 ; framework choisi sans ADR dédié |
| C. `use-intl` seul | Même moteur que `next-intl` | Exige `react` en dépendance de pair pour rien aujourd'hui |

## Décision
**Option A.**
- Catalogues `src/messages/{fr,de,en}.json` (le français est la référence), format **ICU MessageFormat**.
- **Clés typées** dérivées de `fr.json` : une clé inconnue ne compile pas.
- Traducteur qui **ne lève jamais** : repli sur le français puis sur la clé, avec une ligne de journal sans valeur.
- **Contrôle de parité bloquant** (`pnpm i18n:check` + tests du job `unit`) : mêmes clés, mêmes variables, ICU valide, pas d'apostrophe droite, pas de balise, nom de clé conforme.
- Messages d'erreur publics **localisés par `code`** (`errors.<code>`), avec test de complétude des codes de `src/`.
- Langue : `?lang=` > préférence de l'utilisateur > langue de l'organisation > `Accept-Language` > français. Formats : `fr-CH`, `de-CH`, `en-GB`, fuseau `Europe/Zurich`.
- La **règle ESLint** « aucune chaîne en dur » porte sur le JSX : elle arrive avec le premier JSX (PLT-03). D'ici là, les clés typées et les tests tiennent lieu de garde-fou.

## Conséquences
- PLT-03 branche `next-intl` sur les mêmes fichiers (un test d'intégration confirmera l'équivalence de rendu).
- Une page d'accueil **temporaire** (échappement systématique) prouve la négociation de langue de bout en bout (AC21) et sera remplacée.
- **Les textes DE et EN sont rédigés par une IA : relecture humaine obligatoire avant tout usage réel.**
- Piège ICU à connaître : une apostrophe droite devant `{` retire la variable (`l'{name}` → `l{name}`) ; d'où l'apostrophe typographique `’`, imposée par le contrôle.
- Un message qui ressemble à une balise (`<b>…</b>`) n'est pas rendu (ICU le traite comme balise et le formatage échoue : la clé est renvoyée) ; le contrôle de parité les refuse de toute façon.
