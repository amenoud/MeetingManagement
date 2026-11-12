# 02 – Glossaire métier

À utiliser **tel quel** dans le code (nom anglais entre parenthèses), les specs, l'UI et les commits.

| Terme FR | Code | Définition |
|---|---|---|
| **Organisation** | `tenant` | Entité cliente (entreprise ou association). Périmètre d'isolation étanche. |
| **Utilisateur** | `user` | Identité globale (e-mail unique). Peut appartenir à plusieurs organisations. |
| **Appartenance** | `membership` | Lien utilisateur ↔ organisation, avec rôle organisationnel (admin ou utilisateur). |
| **Organe** | `body` | Instance délibérante de l'organisation : conseil d'administration, direction, comité, assemblée générale, commission. |
| **Mandat** | `mandate` | Période (début, fin) pendant laquelle une personne siège dans un organe avec une fonction (président, secrétaire, membre, invité permanent, observateur). La composition d'un organe à une date donnée se déduit des mandats. |
| **Rôle** | `role` | Fonction dans un organe qui détermine les droits (voir `04-roles-permissions.md`). |
| **Séance** | `meeting` | Réunion d'un organe à une date, avec lieu ou lien. |
| **Série de séances** | `meeting_series` | Ensemble d'occurrences générées selon une règle de récurrence. |
| **Convocation** | `convocation` | Envoi formel (e-mail + `.ics`) aux participants, avec ODJ et annexes. Horodatée et tracée. |
| **Participant** | `participant` | Personne convoquée à une séance (membre, invité ponctuel). Porte la réponse RSVP et la présence effective. |
| **RSVP** | `rsvp` | Réponse du participant avant la séance : oui / non / peut-être. |
| **Présence** | `attendance` | Constat en séance : présent (physique/distance), excusé, absent, récusé partiel. |
| **Quorum** | `quorum` | Nombre ou proportion minimale de membres votants présents pour délibérer valablement. Paramétré par organe, constaté en séance. |
| **Ordre du jour (ODJ)** | `agenda` | Liste ordonnée des points d'une séance. |
| **Point d'ODJ** | `agenda_item` | Sujet à traiter : titre, description, durée prévue, rapporteur, annexes, type (information, discussion, décision). |
| **Point proposé** | `agenda_item` (statut `proposed`) | Point soumis par un membre, à valider ou refuser par le président. |
| **Modèle d'ODJ** | `agenda_template` | Trame réutilisable (points récurrents inclus). |
| **Rapporteur** | `presenter` | Personne qui présente un point. |
| **Notes de séance** | `item_note` | Notes du secrétaire rattachées à un point, source du PV. |
| **Procès-verbal (PV)** | `minutes` | Document officiel relatant les délibérations et décisions d'une séance. |
| **Version de PV** | `minutes_version` | État numéroté du PV ; une version approuvée est verrouillée et hachée. |
| **Approbation** | `approval` | Attestation authentifiée et horodatée du président et du secrétaire (pas une signature électronique qualifiée). |
| **Rectificatif** | `amendment` | Nouvelle version d'un PV approuvé, liée à la précédente, qui n'est jamais modifiée. |
| **Décision** | `decision` | Résolution adoptée par un organe : numéro, texte, date, vote, séance d'origine. Immuable. |
| **Numéro de décision** | `decision.number` | Séquence par organe et année, ex. `CA-2027-004`. |
| **Statut de décision** | `decision.status` | `in_force` (en vigueur), `amended` (modifiée), `repealed` (abrogée). Le statut évolue par lien avec une nouvelle décision, jamais par édition du texte. |
| **Vote** | `vote` | Scrutin sur une proposition : pour / contre / abstention, règle de majorité. |
| **Procuration** | `proxy` | Délégation du droit de vote (V2). |
| **Conflit d'intérêts** | `conflict_declaration` | Déclaration d'un membre sur un sujet ; peut entraîner une **récusation** (`recusal`) sur un point. |
| **Action** | `action` | Tâche issue d'une décision ou d'un point : responsable, échéance, statut. |
| **Risque** | `risk` | Événement incertain à impact négatif, suivi dans le registre d'un organe. |
| **Criticité** | `criticality` | Probabilité (1-5) × impact (1-5) = score 1-25 ; niveaux : faible ≤ 5, moyen ≤ 10, élevé ≤ 15, critique > 15 (paramétrable). |
| **Mesure** | `risk_measure` | Action de traitement d'un risque, avec responsable et échéance. |
| **Document** | `document` | Fichier géré (annexe, statut, règlement, PV exporté), avec versions et ACL. |
| **Bibliothèque** | `library` | Espace documentaire de l'organisation. |
| **Journal d'audit** | `audit_log` | Trace append-only de qui a fait quoi, quand, sur quoi. |
| **Président** | role `chair` | Dirige la séance, valide l'ODJ, approuve le PV. |
| **Secrétaire** | role `secretary` | Prépare convocations et ODJ, rédige le PV. |
| **Membre** | role `member` | Participe et vote. |
| **Invité** | role `guest` | Participe ponctuellement, sans vote, accès limité aux points concernés. |
| **Observateur** | role `observer` | Lecture seule, sans vote, sans notes. |
| **Admin d'organisation** | role `org_admin` | Gère utilisateurs, organes, paramètres, audit. N'a pas automatiquement accès au contenu des séances (principe de séparation). |
