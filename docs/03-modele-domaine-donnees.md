# 03 – Modèle de domaine et modèle de données

## 1. Contextes (modules du monolithe)

| Module | Agrégats principaux |
|---|---|
| `identity` | user, session, mfa_credential, invitation |
| `tenancy` | tenant, membership, tenant_settings |
| `bodies` | body, mandate |
| `meetings` | meeting_series, meeting, participant, convocation |
| `agenda` | agenda_template, agenda_item |
| `minutes` | item_note, attendance, minutes, minutes_version, approval |
| `decisions` | decision, decision_link, vote, ballot |
| `risks` | risk, risk_assessment, risk_measure |
| `actions` | action |
| `documents` | document, document_version, document_acl |
| `governance` | conflict_declaration, recusal |
| `audit` | audit_log |
| `notifications` | notification, outbox_email |

## 2. Règles structurantes

- Toute table métier porte `tenant_id uuid not null` et une politique RLS (ADR-0002). Exceptions globales : `user`, `session`, `mfa_credential`.
- Clés primaires : `uuid` v7. Horodatages en UTC (`timestamptz`) ; fuseau d'affichage par séance (`Europe/Zurich` par défaut).
- Suppression logique (`deleted_at`) sauf pour les objets immuables, jamais supprimables.
- **Immutables** (triggers `BEFORE UPDATE/DELETE` qui lèvent une exception) : `decision` (sauf colonne dérivée `status`, mise à jour uniquement par la fonction `apply_decision_link`), `minutes_version` quand `locked_at` est non nul, `approval`, `ballot` d'un vote clos, `audit_log`.
- **Hash** : `content_hash` = SHA-256 du contenu canonique (JSON trié). `prev_hash` chaîne les versions d'un PV et les entrées du journal d'audit par tenant.
- Tout lien « point d'ODJ ↔ risque / décision / action » est une table de jonction explicite.
- Contraintes composites `(tenant_id, id)` + FK composites pour empêcher une référence inter-tenants même hors RLS.

## 3. Diagramme ER (simplifié)

```mermaid
erDiagram
    TENANT ||--o{ MEMBERSHIP : has
    USER ||--o{ MEMBERSHIP : joins
    TENANT ||--o{ BODY : owns
    BODY ||--o{ MANDATE : composes
    USER ||--o{ MANDATE : holds
    BODY ||--o{ MEETING_SERIES : plans
    BODY ||--o{ MEETING : holds
    MEETING_SERIES ||--o{ MEETING : generates
    MEETING ||--o{ PARTICIPANT : invites
    USER ||--o{ PARTICIPANT : is
    MEETING ||--o{ AGENDA_ITEM : contains
    AGENDA_TEMPLATE ||--o{ AGENDA_ITEM : seeds
    AGENDA_ITEM ||--o{ ITEM_NOTE : documents
    AGENDA_ITEM ||--o{ DOCUMENT : attaches
    MEETING ||--o{ ATTENDANCE : records
    MEETING ||--|| MINUTES : produces
    MINUTES ||--o{ MINUTES_VERSION : versions
    MINUTES_VERSION ||--o{ APPROVAL : approved_by
    AGENDA_ITEM ||--o{ VOTE : submits
    VOTE ||--o{ BALLOT : collects
    VOTE ||--o| DECISION : results_in
    BODY ||--o{ DECISION : issues
    MEETING ||--o{ DECISION : originates
    DECISION ||--o{ DECISION_LINK : source
    DECISION ||--o{ DECISION_LINK : target
    DECISION ||--o{ ACTION : triggers
    BODY ||--o{ RISK : registers
    RISK ||--o{ RISK_ASSESSMENT : history
    RISK ||--o{ RISK_MEASURE : treated_by
    RISK }o--o{ AGENDA_ITEM : discussed_in
    USER ||--o{ CONFLICT_DECLARATION : declares
    AGENDA_ITEM ||--o{ RECUSAL : triggers
    DOCUMENT ||--o{ DOCUMENT_VERSION : versions
    DOCUMENT ||--o{ DOCUMENT_ACL : governed_by
    TENANT ||--o{ AUDIT_LOG : traces

    TENANT { uuid id PK
        text name
        text slug
        text default_locale
        text region
        timestamptz deleted_at }
    USER { uuid id PK
        text email UK
        text password_hash
        text locale
        bool mfa_enabled }
    MEMBERSHIP { uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        text org_role
        text status }
    BODY { uuid id PK
        uuid tenant_id FK
        text name
        text kind
        jsonb rules "quorum, majorite"
        text code }
    MANDATE { uuid id PK
        uuid body_id FK
        uuid user_id FK
        text body_role
        date starts_on
        date ends_on
        bool voting }
    MEETING { uuid id PK
        uuid body_id FK
        timestamptz starts_at
        timestamptz ends_at
        text mode "physical online hybrid"
        text location
        text online_url
        text status }
    PARTICIPANT { uuid id PK
        uuid meeting_id FK
        uuid user_id FK
        text rsvp
        timestamptz rsvp_at }
    ATTENDANCE { uuid id PK
        uuid meeting_id FK
        uuid user_id FK
        text presence
        text channel }
    AGENDA_ITEM { uuid id PK
        uuid meeting_id FK
        int position
        text title
        int duration_min
        uuid presenter_id FK
        text item_type
        text status "proposed validated refused" }
    MINUTES { uuid id PK
        uuid meeting_id FK
        text status
        int current_version }
    MINUTES_VERSION { uuid id PK
        uuid minutes_id FK
        int version_no
        jsonb content
        text content_hash
        text prev_hash
        timestamptz locked_at }
    APPROVAL { uuid id PK
        uuid minutes_version_id FK
        uuid user_id FK
        text approver_role
        timestamptz approved_at
        text hash_attested }
    DECISION { uuid id PK
        uuid body_id FK
        uuid meeting_id FK
        text number UK
        date decided_on
        text text
        jsonb vote_result
        text status
        text content_hash
        tsvector search }
    DECISION_LINK { uuid id PK
        uuid source_id FK
        uuid target_id FK
        text link_type "amends repeals refers" }
    VOTE { uuid id PK
        uuid agenda_item_id FK
        text proposal
        text majority_rule
        text status }
    BALLOT { uuid id PK
        uuid vote_id FK
        uuid user_id FK
        text choice }
    ACTION { uuid id PK
        uuid decision_id FK
        text title
        uuid owner_id FK
        date due_on
        text status }
    RISK { uuid id PK
        uuid body_id FK
        text title
        int probability
        int impact
        int score
        uuid owner_id FK
        text status }
    RISK_ASSESSMENT { uuid id PK
        uuid risk_id FK
        int probability
        int impact
        timestamptz assessed_at }
    RISK_MEASURE { uuid id PK
        uuid risk_id FK
        text description
        uuid owner_id FK
        date due_on
        text status }
    DOCUMENT { uuid id PK
        uuid tenant_id FK
        text title
        text kind
        text storage_key }
    DOCUMENT_VERSION { uuid id PK
        uuid document_id FK
        int version_no
        text sha256
        bigint size }
    DOCUMENT_ACL { uuid id PK
        uuid document_id FK
        text subject_type "body user role"
        uuid subject_id
        text permission }
    CONFLICT_DECLARATION { uuid id PK
        uuid user_id FK
        text subject
        date declared_on }
    RECUSAL { uuid id PK
        uuid agenda_item_id FK
        uuid user_id FK }
    AUDIT_LOG { bigint id PK
        uuid tenant_id FK
        uuid actor_id
        text action
        text entity
        uuid entity_id
        jsonb diff
        text prev_hash
        text hash
        timestamptz at }
```

## 4. Points d'attention de modélisation

1. **Composition de l'organe à une date** : requête sur `mandate` (`starts_on ≤ d ≤ coalesce(ends_on, ∞)`). Au passage d'une séance en « convoquée », on fige les `participant` ; le quorum se calcule sur les `attendance` + mandats votants à la date de séance, hors `recusal`.
2. **Numérotation des décisions** : table `decision_counter(tenant_id, body_id, year, last)` incrémentée sous verrou de ligne, pour éviter doublons et trous.
3. **Statut de décision** : dérivé des `decision_link` (`amends`, `repeals`) par une fonction SQL appelée par le service, jamais par édition libre.
4. **PV** : `content` JSON structuré (en-tête, présences, points, décisions, votes, annexes). Le PDF est un rendu déterministe ; le hash du PDF est conservé avec la version.
5. **Documents** : un fichier n'est jamais écrasé ; une nouvelle version crée une ligne et un objet S3 `tenant/{id}/doc/{docId}/{versionNo}`.
6. **Recherche** : colonnes `tsvector` (config `simple` + `unaccent`, plus config par langue du tenant) avec index GIN, sous RLS.
7. **Journal d'audit** : écrit par trigger **et** par le service pour les événements applicatifs (connexion, export, changement de rôle).
