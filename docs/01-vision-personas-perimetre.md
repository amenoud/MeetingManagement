# 01 – Vision, personas, périmètre

## 1. Vision

Une application web qui permet à une organisation (entreprise ou association) de **préparer, tenir et documenter ses séances de comité** : convoquer, bâtir l'ordre du jour, conduire la séance, produire un procès-verbal fiable, tracer les décisions, les actions et les risques. Le produit garantit trois choses :

1. **Isolation** : les données d'une organisation ne sont jamais visibles d'une autre.
2. **Intégrité** : un PV approuvé et une décision adoptée ne peuvent plus être modifiés, seulement complétés par une nouvelle version ou une décision de modification.
3. **Simplicité** : une personne non technique (secrétaire d'association, assistante de direction) mène une séance complète sans formation.

## 2. Personas

| Persona | Contexte | Besoins clés | Frustration actuelle |
|---|---|---|---|
| **Sophie, secrétaire du CA** (PME SA, 5 administrateurs) | Prépare 6 CA par an, PV exigé par l'art. 713 CO | Convocation avec annexes, quorum, PV conforme, archivage | Word + e-mails, versions éparses |
| **Marc, président d'une association** (80 membres, comité de 7) | Bénévole, 1 comité/mois + 1 AG/an | ODJ rapide, décisions retrouvables, rappels d'actions | Décisions perdues d'une année à l'autre |
| **Nadia, responsable risques/conformité** (entreprise) | Suit un registre de risques par comité | Registre par organe, échéances, lien avec ODJ | Excel non partagé |
| **Luc, membre / administrateur** | Reçoit les convocations, lit les annexes | Confirmer sa présence, lire documents, proposer un point | Pièces jointes dispersées |
| **Admin du tenant** | Souvent le secrétaire ou un DSI | Inviter, rôles, audit, export | Pas de traçabilité |

**Différences entreprise vs association** (impactent la configuration, pas le code) : vocabulaire par défaut (« Conseil d'administration » vs « Comité »), règles de quorum et majorité par organe (champs libres paramétrables), présence de membres invités sans droit de vote, AG avec nombreux participants (V2, hors MVP : l'AG de 80 membres exige une gestion des votes de masse).

## 3. Périmètre

### MVP (cible 2027-01-15, tranches fines)

| Domaine | Contenu MVP |
|---|---|
| Organisations & utilisateurs | Création tenant, inscription, login + mot de passe, **MFA TOTP**, invitation par e-mail, appartenance à plusieurs organisations, organes, **mandats avec dates**, 6 rôles |
| Séances | Création, série simple, convocation e-mail, `.ics`, RSVP, lieu physique / en ligne (lien libre) / hybride |
| ODJ | Points ordonnés avec durée et rapporteur, annexes, points proposés par membres validés par président, copie d'un ODJ précédent |
| Conduite & PV | Présences, quorum, notes par point, génération PV structuré, workflow brouillon → relecture → approbation, export PDF, verrouillage, versions + hash |
| Décisions | Registre immuable numéroté, statuts, liens, **recherche plein texte** |
| Risques | Registre par organe, probabilité × impact, mesures, échéances, lien ODJ, tableau trié |
| Complémentaires retenus | Actions (suivi + relances e-mail), votes en séance (résultat + décompte), déclaration de conflits d'intérêts + récusation par point, bibliothèque documentaire (ACL par organe), tableau de bord simple, notifications fixes, i18n FR/DE/EN, journal d'audit (écriture + consultation simple) |

### Classement des fonctionnalités complémentaires

| Fonctionnalité | Classe | Justification |
|---|---|---|
| Suivi des actions | **MVP** | Découle directement des décisions ; modèle simple |
| Votes en séance | **MVP** (léger) | Nécessaires pour décisions : nombre pour/contre/abst., règle de majorité simple |
| Votes par circulation / à distance, procurations, majorités qualifiées | **V2** | Règles juridiques complexes (art. 713 al. 2 CO pour la circulation) |
| Conflits d'intérêts | **MVP** (léger) | Déclaration par membre + récusation par point (affecte quorum et vote) |
| Bibliothèque documentaire | **MVP** (léger) | Mutualise annexes et PV approuvés ; ACL par organe |
| Mandats et composition dans le temps | **MVP** | Détermine qui est convoqué, qui compte pour le quorum |
| Tableau de bord | **MVP** (simple) | 3 widgets : séances à venir, actions en retard, risques critiques |
| Notifications configurables | **V2** (MVP : rappels fixes J-7, J-1, actions J+1) | |
| Assistance IA | **V2** | Sous-traitant UE obligatoire (H7), désactivable par tenant |
| Multilingue FR/DE/EN | **MVP** | Demandé (réponse 10) ; coût minimal si fait dès le départ |
| Journal d'audit consultable | **MVP** (simple) / export en V2 | Écriture obligatoire dès le jour 1 |
| Export complet d'une organisation | **V2** | Archive ZIP asynchrone ; le modèle de données la permet dès le MVP |
| Signature électronique qualifiée | **Plus tard** | Réponse 6 |
| SSO (OIDC/SAML), passkeys | **Plus tard** | Réponse 9 |
| Intégrations visio, calendriers bidirectionnels | **Plus tard** | Réponse 8 |
| Facturation / plans | **Plus tard** | Commercialisation |

### Hors périmètre

Comptabilité, gestion des membres/cotisations d'association, vote électronique secret de masse (AG), application mobile native, messagerie interne, éditeur collaboratif temps réel.

## 4. Critères de succès du MVP

- Une séance complète (convocation → PV approuvé → décisions → actions) se mène en < 30 min de saisie hors rédaction.
- Les tests d'isolation inter-tenants passent à 100 % en CI.
- Un PV approuvé ne peut être modifié par aucun chemin (UI, API, SQL applicatif).
- Une restauration de sauvegarde a été exécutée et vérifiée avant la mise en production.
