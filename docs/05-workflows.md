# 05 – Workflows clés

## 1. Cycle de vie d'une séance

```mermaid
stateDiagram-v2
    [*] --> Brouillon
    Brouillon --> Planifiee: dates + organe valides
    Planifiee --> Convoquee: envoi convocation (e-mail + ics)
    Convoquee --> Convoquee: modification (nouvelle convocation tracée)
    Convoquee --> EnCours: ouverture (quorum constaté)
    Planifiee --> Annulee
    Convoquee --> Annulee: avis d'annulation envoyé
    Convoquee --> Reportee: nouvelle date (nouvelle convocation)
    Reportee --> Convoquee
    EnCours --> Terminee: clôture par le président
    Terminee --> PVEnCours: génération du brouillon de PV
    PVEnCours --> Cloturee: PV approuvé et verrouillé
    Cloturee --> [*]
    Annulee --> [*]
```

Règles : le quorum non atteint maintient la séance « en cours » en mode « délibération impossible » (les votes sont bloqués, les points d'information restent possibles). Une convocation modifiée après envoi génère une nouvelle convocation avec la mention « mise à jour ». Une séance « clôturée » est en lecture seule.

## 2. Approbation du PV

```mermaid
stateDiagram-v2
    [*] --> Brouillon: généré depuis les notes
    Brouillon --> EnRelecture: soumis par le secrétaire
    EnRelecture --> Brouillon: commentaires / corrections demandés
    EnRelecture --> Approuve: attestation du président ET du secrétaire
    Approuve --> Verrouille: version figée (hash + horodatage)
    Verrouille --> Rectifie: rectificatif (nouvelle version liée)
    Rectifie --> EnRelecture
    Verrouille --> [*]
```

```mermaid
sequenceDiagram
    actor S as Secrétaire
    actor M as Membres
    actor P as Président
    participant A as Application
    participant DB as Base (triggers)
    S->>A: Soumettre le PV v1 à relecture
    A->>M: Notification de relecture (e-mail)
    M->>A: Commentaires
    S->>A: Intègre, re-soumet
    P->>A: Approuver (re-authentification MFA)
    S->>A: Approuver (re-authentification MFA)
    A->>A: Calcule SHA-256 du contenu canonique + rend le PDF
    A->>DB: Insert approvals, set locked_at, content_hash, prev_hash
    DB-->>A: Triggers interdisent tout UPDATE ultérieur
    A->>DB: Audit log (hash chaîné)
    A->>M: PV approuvé publié (PDF avec bloc de signature vide)
```

Règles : l'approbation exige une **ré-authentification** (mot de passe ou TOTP) dans les 5 minutes. Toute modification du contenu après la première attestation réinitialise les attestations. Un rectificatif crée la version n+1 avec `prev_hash` pointant sur la version précédente.

## 3. Cycle de vie d'une décision

```mermaid
stateDiagram-v2
    [*] --> Proposee: point de type décision + vote ouvert
    Proposee --> Rejetee: vote clos, majorité non atteinte (consignée dans le PV, pas au registre)
    Proposee --> EnVigueur: vote clos, majorité atteinte, numéro attribué
    EnVigueur --> Modifiee: nouvelle décision type « amends »
    Modifiee --> Modifiee: nouvelle modification
    EnVigueur --> Abrogee: nouvelle décision type « repeals »
    Modifiee --> Abrogee
    Abrogee --> [*]
```

Règles : le texte d'une décision ne change **jamais**. « Modifiée » et « abrogée » sont des statuts dérivés de liens vers une nouvelle décision. Une décision issue d'une séance dont le PV n'est pas encore approuvé est marquée « en attente d'approbation du PV » dans l'affichage, mais reste enregistrée.

## 4. Cycle de vie d'un risque

```mermaid
stateDiagram-v2
    [*] --> Propose: proposé par un membre
    Propose --> Identifie: validé par président/secrétaire
    Propose --> Refuse
    Identifie --> Evalue: probabilité x impact saisis (historisés)
    Evalue --> EnTraitement: mesures et échéances définies
    EnTraitement --> Surveille: mesures réalisées
    Surveille --> Evalue: réévaluation périodique
    Evalue --> Accepte: décision d'accepter le risque (lien décision)
    Surveille --> Clos
    Accepte --> Surveille
    Clos --> [*]
    Refuse --> [*]
```

Règles : chaque réévaluation crée une ligne `risk_assessment` (historique conservé). Un risque critique (> 15) sans mesure ni échéance apparaît en alerte au tableau de bord. Un risque peut être lié à plusieurs points d'ODJ.

## 5. Cycle de vie d'une action

```mermaid
stateDiagram-v2
    [*] --> AFaire: créée depuis une décision ou un point
    AFaire --> EnCours: démarrée
    EnCours --> Terminee: marquée terminée par le responsable
    AFaire --> Annulee
    EnCours --> Annulee
    Terminee --> EnCours: réouverture motivée
    Terminee --> [*]
    Annulee --> [*]
```

Règles : « en retard » est un **état dérivé** (échéance dépassée et statut non terminal), pas un statut stocké. Relances e-mail : J-3, J+1, puis hebdomadaires pendant 4 semaines, via le job `action-reminders`. Un report d'échéance est tracé (ancienne, nouvelle, motif).

## 6. Proposition d'un point par un membre

```mermaid
sequenceDiagram
    actor Mb as Membre
    actor P as Président
    participant A as Application
    Mb->>A: Proposer un point (titre, description, annexes)
    A-->>P: Notification « point à valider »
    alt validé
        P->>A: Valider, fixe position et durée
        A-->>Mb: Point accepté
    else refusé
        P->>A: Refuser avec motif
        A-->>Mb: Point refusé (motif)
    end
```

Règle : un point proposé n'apparaît pas dans la convocation tant qu'il n'est pas validé ; la date limite de proposition est paramétrable par organe.
