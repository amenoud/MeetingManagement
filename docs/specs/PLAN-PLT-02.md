# PLAN-PLT-02 – Internationalisation FR / DE / EN

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (**AC21**) · ADR-0008 §3 (next-intl, 3 langues) · `docs/specs/PLAN-PLT-01.md` §4.4 (messages d'erreur localisés par `code`) · hypothèse H10 (`docs/00-cadrage-hypotheses.md`) · Issue : PLT-02 · Taille : M
- Branche : `feat/plt-02-i18n` · Dépend de : PLT-01 (fait)

## 1. État constaté (2026-11-14)
- Aucun catalogue de messages : `src/messages/` n'existe pas. Le seul message utilisateur est celui d'un `AppError` (anglais, en dur).
- **Next.js n'est pas installé** : ADR-0008 prévoit `next-intl`, qui exige Next.js. Le choix du framework web est prévu avec PLT-03.
- `use-intl` (cœur de `next-intl`) exige `react` en dépendance de pair ; `intl-messageformat` (le moteur ICU qu'il utilise) n'en a pas besoin.
- Les données de locale (ICU complètes) sont présentes dans Node 24 : `de-CH`, `fr-CH`, `en-GB` se formatent correctement.
- Le serveur actuel est le serveur temporaire `/healthz` ; il n'a pas de page d'accueil.

## 2. Périmètre
Tout ce qui est **durable** de l'i18n, sans attendre le framework web : catalogues, clés typées, traducteur ICU, négociation de langue, formats de date et de nombre, messages d'erreur localisés, et le **contrôle de parité bloquant en CI**. La page d'accueil existe sous forme **temporaire** pour prouver AC21 de bout en bout. Le câblage `next-intl` et la règle ESLint sur les chaînes en dur viennent avec le premier JSX (PLT-03).

## 3. Décisions à valider

### 3.1 Cœur i18n indépendant du framework (recommandé) ou Next.js tout de suite ?
| Option | Pour | Contre |
|---|---|---|
| **A. Cœur maison léger sur `intl-messageformat` (ICU), réutilisable par `next-intl` plus tard** | Pas de dépendance à React/Next.js maintenant ; les mêmes fichiers `fr/de/en.json` serviront à `next-intl` (même format ICU) ; sert aussi aux e-mails, PDF et erreurs de l'API | ~80 lignes à maintenir ; léger écart possible avec `next-intl` sur les balises riches (non utilisées au départ) |
| B. Installer Next.js + `next-intl` dans PLT-02 | Une seule pile dès maintenant | PR énorme (framework, image Docker, CI) qui avale PLT-03 ; décision de framework prise sans ADR dédié |
| C. `use-intl` seul (sans Next.js) | Même moteur que `next-intl` | Exige `react` en dépendance de pair : une dépendance lourde « pour rien » aujourd'hui |

**RECO : A.** Consigné en **ADR-0012** (complète ADR-0008). Conséquence : la règle ESLint « aucune chaîne en dur dans l'UI » est **reportée à PLT-03** (elle porte sur le JSX, qui n'existe pas encore) ; en attendant, la sécurité vient de **clés typées** (une clé inconnue ne compile pas) et des tests ci-dessous.

### 3.2 Page d'accueil temporaire
`GET /` renvoie une page HTML minimale (échappement systématique, `lang`, `Content-Language`, `Vary: Accept-Language`) dans la langue négociée : c'est ce qui prouve AC21 et la négociation de bout en bout. Elle est **jetable** (remplacée par la vraie page en PLT-03). Alternative : reporter la preuve d'AC21 à PLT-03.
**RECO : la page temporaire** (≈ 40 lignes), parce qu'elle teste aussi les en-têtes de négociation.

### 3.3 Messages d'erreur localisés par `code`
`AppError(code, status, messageParDéfaut)` : la réponse HTTP utilise `errors.<code>` dans la langue de la requête ; le message par défaut (anglais) ne sert que de repli en développement. `internal_error` est localisé aussi. Un test garantit que **tout code utilisé dans `src/`** existe dans les 3 catalogues.

### 3.4 Conventions linguistiques (contexte suisse)
| Sujet | Choix proposé |
|---|---|
| Langue de l'interface | `fr` (langue source), `de`, `en` |
| Variantes de formatage | `fr` → `fr-CH`, `de` → `de-CH`, `en` → `en-GB` (dates jj.mm.aaaa / 24 h ; pas d'AM/PM) |
| Allemand | orthographe suisse **sans « ß »** (« ss »), vouvoiement (« Sie ») |
| Français | vouvoiement, orthographe suisse (« septante », « nonante » si nombres en lettres) |
| Terminologie | **glossaire trilingue** `docs/i18n-glossaire.md` : organe = *Gremium* / *body*, séance = *Sitzung* / *meeting*, point d'ODJ = *Traktandum* / *agenda item*, PV = *Protokoll* / *minutes*, décision = *Beschluss* / *decision*, mandat = *Mandat* / *term of office* (à valider) |
| Fuseau | `Europe/Zurich` par défaut (réglable par séance) |
| Priorité de langue | préférence de l'utilisateur → langue du tenant → `Accept-Language` → `fr` ; `?lang=` explicite prioritaire pour la page temporaire |

**Important : les textes allemands et anglais sont rédigés par moi (IA)** : ils sont corrects pour le développement, mais **doivent être relus par une personne maîtrisant la langue avant tout usage réel**. Je le signale dans la PR et dans `docs/i18n.md`.

## 4. Livrables
| Élément | Contenu |
|---|---|
| `src/messages/{fr,de,en}.json` | Namespaces `app`, `home`, `errors`, `language` ; fr = source de vérité |
| `src/platform/i18n/` | `messages.ts` (types de clés dérivés de `fr.json`), `translator.ts` (ICU : pluriels, sélection ; repli fr puis clé ; journalise `i18n.missing_message` sans lever), `locale.ts` (`resolveLocale` : `Accept-Language` avec q-values, `fr-CH`→`fr`…), `format.ts` (date, heure, nombre via `Intl` avec fuseau) |
| `errors.ts` / `http.ts` | Réponse d'erreur localisée à partir de la langue de la requête |
| Page d'accueil temporaire | `GET /` (§3.2) |
| `docs/i18n.md`, `docs/i18n-glossaire.md`, ADR-0012 | Conventions (ICU, pas de concaténation, pas de HTML dans les messages, pluriels, noms de clés `domaine.élément.état`), glossaire trilingue, décision |
| `CLAUDE.md` | Règle i18n précisée (clés typées, `t()`, parité) |

## 5. Tests (AC21)
| Test | Vérifie |
|---|---|
| **Parité des clés** | Les 3 catalogues ont exactement les mêmes clés ; aucune valeur vide ; **mêmes variables ICU** pour une clé donnée dans les 3 langues (`{count}`, `{name}`…) ; syntaxe ICU valide ; la CI **échoue** si une clé manque dans une langue (**AC21, 2ᵉ partie**), avec le nom de la clé et de la langue |
| **Test du test** | Un catalogue volontairement incomplet, avec une variable en trop ou une syntaxe invalide, est détecté |
| **Page d'accueil dans 3 langues** | `?lang=fr|de|en` et `Accept-Language` (avec q-values, `de-CH`, langue inconnue ⇒ repli `fr`) ; `<html lang>`, `Content-Language`, `Vary` ; échappement (une valeur hostile n'injecte pas de balise) |
| Erreurs localisées | `not_found`, `forbidden`, `internal_error` dans les 3 langues ; code inconnu ⇒ message par défaut ; **toujours** le `requestId` |
| Complétude des codes | Chaque `new AppError('code', …)` de `src/` a sa clé `errors.<code>` dans les 3 langues |
| Formats | nombres et dates en `fr-CH`/`de-CH`/`en-GB` (propriétés stables : séparateur décimal, ordre jour-mois-année, 24 h) ; **changement d'heure** à Zurich (12:00 UTC = 13:00 en hiver, 14:00 en été) |
| Traducteur | pluriels (`0`, `1`, `n` dans les 3 langues), sélection, repli sur `fr` puis sur la clé sans lever, journal sans valeur sensible |
| Clés typées | un fichier de test de typage prouve qu'une clé inconnue ne compile pas (`@ts-expect-error` avec description) |
| **Mutations** | je retire une clé de `de.json`, je change une variable dans `en.json`, j'inverse la priorité de langue : les tests correspondants doivent échouer |

Tous en tests unitaires (sans base) : ils tournent dans le job `unit`, donc **bloquants**.

## 6. Risques
- **Qualité de traduction** : relecture humaine obligatoire pour DE et EN (§3.4).
- **Séparateurs de milliers** : ils dépendent de la version des données de locale de Node. Les tests vérifient des propriétés stables (séparateur décimal, groupement présent, ordre des champs), pas l'octet exact.
- **Écart avec `next-intl`** au câblage (PLT-03) : mêmes fichiers et même format ICU ; un test d'intégration le confirmera à ce moment.
- **Page temporaire** : surface HTML nouvelle : échappement systématique et test d'injection ; aucune donnée utilisateur affichée.
- **Messages publics** : un message d'erreur ne contient jamais de donnée (règle de PLT-01) ; la localisation par clé empêche d'y interpoler du contenu libre.

## 7. Hors périmètre
Câblage `next-intl`, routage par langue, sélecteur de langue dans l'interface, règle ESLint sur le JSX (PLT-03) ; e-mails et PDF localisés (leurs issues) ; traduction automatique du contenu saisi (exclue, H10) ; préférence de langue stockée en base (avec le modèle utilisateur, ID-01).

## 8. Questions pour G2
1. **Cœur i18n sur `intl-messageformat`, sans Next.js maintenant** (option A), règle ESLint reportée à PLT-03 ? Reco : oui.
2. **Page d'accueil temporaire** pour prouver AC21 maintenant ? Reco : oui.
3. **Messages d'erreur localisés par `code`**, avec test de complétude des codes ? Reco : oui.
4. **Conventions du §3.4** (fr-CH / de-CH sans ß / en-GB, vouvoiement, glossaire trilingue) et **relecture humaine de DE et EN** avant usage réel ? Reco : oui. Dites-moi si vous préférez `en-CH`, ou un autre vocabulaire (ex. *Traktandum* vs *Tagesordnungspunkt*).
