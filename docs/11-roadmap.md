# 11 – Roadmap en incréments

Hypothèses : démarrage lundi **2026-11-16**, 10-15 h/semaine (H2), MVP visé **2027-01-15** (H3), tampon jusqu'au **2027-01-29**. Chaque incrément est livrable sur staging et se termine par une rétrospective. Si la capacité réelle est inférieure à 15 h/semaine, appliquer la liste des coupes (`00-cadrage-hypotheses.md` §4) **avant** de comprimer les tests.

| Inc | Semaines | Contenu | Specs | Sortie vérifiable |
|---|---|---|---|---|
| **0 Socle** | S1 (16.11) | Dépôt, CI/sécurité, Docker, base + RLS + `withTenant`, tests d'isolation, i18n de base, déploiement staging, runbook de restauration | SPEC-000 | « Hello tenant » déployé sur staging, CI verte, isolation testée, restauration réussie |
| **1 Identité et organisations** | S2–S3 | Inscription/création tenant, login, sessions, TOTP, invitations, multi-organisations, organes, mandats, rôles, `authz`, audit de base | SPEC-001…004 | Un admin crée une organisation, un organe, invite un secrétaire avec MFA |
| **2 Séances et convocations** | S4 | Séances (physique/en ligne/hybride), série simple, convocations e-mail + `.ics`, RSVP | SPEC-010 | Convocation reçue dans Outlook/Apple Calendar, RSVP enregistré |
| **3 Ordre du jour et documents** | S5 | Points (ordre, durée, rapporteur), points proposés, copie d'ODJ, bibliothèque + annexes + ACL par organe | SPEC-011, 012 | ODJ publié, annexe consultable, accès refusé hors ACL |
| **4 Conduite et PV** | S6–S7 | Présences, quorum, notes, génération PV, workflow, approbation (ré-auth), verrouillage, hash, PDF | SPEC-020, 021 | PV approuvé immuable, PDF reproductible, rectificatif |
| **5 Décisions, votes, actions, conflits** | S7–S8 | Votes en séance, décisions numérotées, liens, recherche, actions + relances, conflits/récusations | SPEC-030…033 | Décision issue d'un vote ; recherche ; relance d'action reçue |
| **6 Risques et tableau de bord** | S8–S9 | Registre, matrice/tableau, mesures, liens ODJ, tableau de bord, journal d'audit consultable | SPEC-040, 041 | Risque critique visible au tableau de bord |
| **7 Durcissement et pilote** | S10–S11 | Revue ASVS L2, tests de charge légers, a11y, polissage i18n, restauration rejouée, mise en production, premières données réelles | SPEC-090 | Production en service avec approbation manuelle |

Après MVP (V2) : export tenant, votes par circulation/procurations, ACL fine par document, modèles d'ODJ et points récurrents complets, récurrence avancée, notifications configurables, IA, antivirus, horodatage RFC 3161, intégrations calendrier. Puis : SSO, signature qualifiée, facturation.

---

## Prochain prompt à me donner, par incrément

> À chaque début d'incrément, ouvrez une **nouvelle session** Claude Code dans le dépôt, avec `CLAUDE.md` chargé.

**Pré-incrément 0 – initialisation du dépôt** (maintenant) :
```
Lis CLAUDE.md et docs/ (00 à 12). Initialise le dépôt Git local à partir de ce dossier, puis propose le plan (sans coder) de l'issue INF-01 du backlog (docs/12-backlog.md) : structure du dépôt, outillage, scripts pnpm. Attends ma validation du plan (G2) avant d'écrire du code.
```

**Incrément 0 :**
```
Contexte : docs/10-processus-adlc.md et docs/12-backlog.md (Incrément 0). Rédige docs/specs/SPEC-000-socle.md (user stories techniques + critères d'acceptation testables pour : CI, RLS/withTenant, tests d'isolation, i18n, déploiement staging, restauration). Ne code rien. Liste les questions ouvertes. Je validerai la spec (G1).
```

**Incrément 1 :**
```
L'incrément 0 est terminé (rétro faite). Rédige SPEC-001 à SPEC-004 (inscription/tenant, authentification + TOTP, invitations et multi-organisations, organes/mandats/rôles/authz/audit) à partir de docs/03, 04, 05 et ADR-0002/0003. Chaque critère d'acceptation reçoit un identifiant. Indique pour chaque spec les tables, RLS, événements d'audit, clés i18n et tests d'isolation/authz nécessaires. Pas de code.
```

**Incrément 2 :**
```
Rédige SPEC-010 (séances, série simple, convocations e-mail + .ics, RSVP) selon docs/05 §1, ADR-0009 et la matrice docs/04. Inclure les cas d'heure d'été, de mise à jour (SEQUENCE) et d'annulation. Pas de code ; liste les questions ouvertes.
```

**Incrément 3 :**
```
Rédige SPEC-011 (ordre du jour : points, ordre, durées, rapporteurs, points proposés/validation, copie d'un ODJ précédent) et SPEC-012 (bibliothèque documentaire, annexes, ACL par organe, ADR-0005). Pas de code.
```

**Incrément 4 :**
```
Rédige SPEC-020 (conduite de séance : présences, quorum, notes par point) et SPEC-021 (génération du PV, workflow brouillon → relecture → approbation, ré-authentification, verrouillage, hash, rectificatif, PDF) selon docs/05 §2, ADR-0006 et ADR-0008. Inclure l'impact légal art. 713 CO (bloc de signature vide). Pas de code.
```

**Incrément 5 :**
```
Rédige SPEC-030 (votes en séance), SPEC-031 (décisions : numérotation, liens, statut dérivé, recherche FTS), SPEC-032 (actions et relances), SPEC-033 (conflits d'intérêts et récusation) selon docs/05 §3 et §5. Pas de code.
```

**Incrément 6 :**
```
Rédige SPEC-040 (registre des risques, historique d'évaluation, mesures, liens ODJ) et SPEC-041 (tableau de bord et journal d'audit consultable). Pas de code.
```

**Incrément 7 :**
```
Prépare l'incrément de durcissement : produis la checklist ASVS L2 appliquée à l'application (avec preuve ou issue pour chaque point), le plan de test de charge léger, la checklist de mise en production (sauvegarde, restauration rejouée, DNS/SPF/DKIM/DMARC, secrets, approbation) et SPEC-090. Pas de code tant que je n'ai pas validé G1.
```

---

## Indicateurs suivis par incrément
Lead time par issue · nombre de PR rejetées en G3 · défauts échappés en staging · couverture spec ↔ tests · heures réelles vs prévues (pour recalibrer la date MVP).
