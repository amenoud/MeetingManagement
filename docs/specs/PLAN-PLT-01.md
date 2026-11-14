# PLAN-PLT-01 – Configuration, logs sans fuite, erreurs sûres

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (**AC18**, renforce AC17) · `docs/07-menaces-securite.md` (V7 journalisation, fuite par logs) · `docs/08-conformite.md` (T8 : journaux techniques, 30 jours, aucun contenu métier) · Issue : PLT-01 · Taille : M-L, **à découper (§3)**
- Branche : `feat/plt-01-config-logging` · Dépend de : INF-03 (fait)

## 1. Pourquoi maintenant
Les journaux sont la fuite la plus probable d'un produit qui manipule des PV et des données personnelles : un `console.log(error)` d'une erreur Drizzle écrit le SQL **et ses paramètres** (constaté en DB-02) ; un message d'erreur PostgreSQL peut contenir des valeurs (`detail`) ; un jeton dans une URL finit dans un journal d'accès. On pose la règle **avant** d'avoir du code applicatif, avec un test qui prouve l'absence de fuite.

## 2. État constaté
- `src/platform/config.ts` valide l'environnement (Zod, ne répète jamais les valeurs) mais renvoie les secrets en **chaînes ordinaires** (un `log(config)` les écrirait).
- `process.env` est lu dans plusieurs fichiers, sans règle.
- Aucun logger : `main.ts` et `with-tenant.ts` utilisent `console` directement (un message JSON écrit à la main).
- Rien ne propage `request_id` / `tenant_id` aux journaux.

## 3. Découpage proposé (2 PR, chacune < 400 lignes hors tests)
| PR | Contenu | Critères |
|---|---|---|
| **PLT-01a** | Configuration durcie + contexte de requête + logger avec **masquage** | AC18 (cœur : masquage, `request_id`, `tenant_id`), AC17 renforcé |
| **PLT-01b** | Modèle d'erreurs + traduction en réponse HTTP + journal des requêtes du serveur temporaire + intégration `withTenant` | AC18 au niveau HTTP |

## 4. Décisions techniques à valider

### 4.1 Bibliothèque de logs : `pino` + masquage maison, ou logger maison sans dépendance ?
| Option | Pour | Contre |
|---|---|---|
| **A. `pino` + fonction de masquage maison** (`formatters`/`serializers`, `mixin` pour le contexte) | Standard, JSON sur stdout (adapté au PaaS), niveaux et enfants prêts, s'intègre à Next.js | 1 dépendance (largement utilisée) |
| B. Logger maison (~100 lignes) | Zéro dépendance, contrôle total | À maintenir ; réinvente niveaux, enfants, formats |

**RECO : A.** Le masquage (la partie qui compte) reste notre code, testé seul. Consigné en **ADR-0011**.

### 4.2 Contexte de requête
`AsyncLocalStorage` : `runWithContext({ requestId }, fn)`, `setTenant(id)` (appelé par `withTenant`), `setUser(id)`. Le logger injecte automatiquement `request_id`, `tenant_id`, `user_id` : aucun appel n'a à les passer à la main (donc aucun oubli). `request_id` : UUID généré, ou **reprise d'un en-tête entrant seulement s'il correspond à `^[A-Za-z0-9-]{8,64}$`** (sinon injection de lignes dans les journaux), renvoyé dans la réponse.

### 4.3 Règles de masquage (`scrub`, fonction pure, testée seule)
- **Par clé** (insensible à la casse, `-`/`_` ignorés) : `password`, `secret`, `token`, `authorization`, `cookie`, `set-cookie`, `apikey`, `accesskey`, `privatekey`, `session`, `csrf`, `otp`, `totp`, `credential`, `signature`, `dsn`, `connectionstring`, `databaseurl` → `[REDACTED]`.
- **Clés de contenu** : `content`, `body`, `notes`, `text`, `html`, `markdown`, `transcript`, `minutes` → `[REDACTED:content]`. C'est un **filet** ; la règle de fond reste « on journalise des identifiants, jamais du contenu » (inscrite dans `CLAUDE.md`).
- **Par valeur** (dans toute chaîne, même sous une clé innocente) : identifiants dans une URL de connexion (`://user:motdepasse@`), `Bearer …`, jetons de type JWT, longues suites aléatoires (≥ 32 caractères, **UUID exclus**), adresses e-mail → `[email]`.
- **Bornes** : profondeur 6, chaînes 2 000 caractères, tableaux 50 éléments, références circulaires, `Buffer`/fonctions/`bigint` gérés ; le masquage ne lève **jamais** d'exception (en cas d'échec : l'entrée entière devient `[UNLOGGABLE]`).

### 4.4 Erreurs (PLT-01b)
- Les erreurs inconnues sont journalisées avec un **sérialiseur sûr** : nom, code, pile ; pour une erreur PostgreSQL **uniquement** `code`, `severity`, `schema`, `table`, `column`, `constraint`, `routine` (jamais `message`, `detail`, `where`, `hint` : ils peuvent contenir des valeurs) ; le message du wrapper Drizzle (SQL + paramètres) est **remplacé** par une constante.
- Réponse à l'utilisateur : `{ error: { code, message, requestId } }` ; pour toute erreur non prévue : code `internal_error` et message générique, **jamais** le message d'origine. Les erreurs prévues (`AppError` : `code`, `status`, message public) sont explicites ; la localisation FR/DE/EN des messages arrive avec PLT-02 (par `code`).

### 4.5 Configuration durcie (PLT-01a)
- Les secrets sont enveloppés dans un type `Secret<T>` : `toString`, `toJSON` et l'affichage console renvoient `[REDACTED]` ; la valeur n'est lisible que par `reveal()` (appelé aux seuls points d'usage : pool, SMTP, S3).
- Configuration **gelée** (`Object.freeze`) et fournie par `getConfig()` ; ajout de `LOG_LEVEL`.
- Règle ESLint : `process.env` n'est lu que dans `config.ts`, le point d'entrée `main.ts` et les outils de sauvegarde (liste explicite).
- Test de dérive : chaque variable du schéma est présente dans `.env.example`.

## 5. Tests (AC18)
| Test | Vérifie |
|---|---|
| **AC18 requête** | Un `request_id` apparaît dans toutes les lignes d'une requête ; `tenant_id` après `setTenant` ; une requête portant `Authorization: Bearer …`, `Cookie`, mot de passe dans le corps et jeton dans l'URL **ne laisse aucune de ces valeurs** dans les journaux (chaque valeur secrète est cherchée dans la sortie brute) |
| Masquage par clé / par valeur / contenu | tableaux de cas, y compris imbriqués, casse mixte, tableaux, circulaires, très profonds |
| Non-régression sur les faux positifs | UUID, identifiants et nombres ne sont **pas** masqués |
| Résilience | un objet qui lève dans `toJSON` ne casse pas le journal |
| Erreur PostgreSQL / Drizzle | ni SQL, ni paramètres, ni `detail` dans les journaux ; réponse HTTP générique avec `requestId` |
| `Secret` | `JSON.stringify`, `String`, `util.inspect` et `console.log` ne révèlent rien |
| `request_id` entrant | valeur hostile (retours à la ligne, trop longue) ⇒ remplacée par un UUID |
| Dérive `.env.example` | schéma ⊆ fichier |
| **Mutations** | je désactive tour à tour le masquage par clé, par valeur et le sérialiseur d'erreur PostgreSQL : les tests correspondants doivent échouer |

Tous en tests unitaires (sans base), donc dans le job `unit`.

## 6. Risques
- **Masquage incomplet** : un filet n'est jamais exhaustif. Parades : règle de fond (identifiants seulement), tests par valeur, revue en G3 ; je ne prétends pas qu'aucune fuite n'est possible, seulement que les cas listés sont couverts et testés.
- **Faux positifs** (valeur utile masquée) : cas de non-régression ; un `[REDACTED]` est toujours visible, jamais un trou silencieux.
- **Adresses IP** : leur journalisation (tronquée) est décidée avec PLT-03 (où la requête HTTP existe), conformément au registre T8.
- **Dépendance `pino`** : épinglée par le lockfile, suivie par Dependabot, `pnpm audit` en CI.
- **Performances** : masquage récursif à chaque ligne ; négligeable à cette échelle, borné par les limites de profondeur et de taille.

## 7. Hors périmètre
Serveur web définitif, en-têtes et limitation de débit (PLT-03) ; journal d'audit métier (AUD-01, distinct des journaux techniques) ; traçage et métriques ; expédition des journaux ; masquage dans les e-mails/PDF.

## 8. Questions pour G2
1. **`pino` + masquage maison** (option A) plutôt qu'un logger maison ? Reco : oui.
2. **Règles de masquage et d'erreurs du §4.3/§4.4** : clés + valeurs + contenu + e-mails masqués, erreurs PostgreSQL journalisées **par code seulement**. Reco : oui.
3. **Enveloppe `Secret` + règle ESLint sur `process.env` + test de dérive `.env.example`**. Reco : oui.
4. **Découpage en deux PR** (PLT-01a puis PLT-01b). Reco : oui.
