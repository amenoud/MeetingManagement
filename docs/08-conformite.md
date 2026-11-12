# 08 – Conformité : nLPD, RGPD, conservation, export, suppression

> Ce document structure la conformité. Il **ne remplace pas un avis juridique**. Les références d'articles sont à faire valider avant commercialisation.

## 1. Rôles

- **Client (tenant)** = responsable du traitement des données de ses membres et de ses séances.
- **Éditeur de l'application** = **sous-traitant** (art. 9 nLPD ; art. 28 RGPD) pour le contenu du tenant ; **responsable** pour les données de compte (e-mail, mot de passe haché, journaux de sécurité) et de facturation.
- Un **contrat de sous-traitance (DPA)** est signé avec chaque client et avec chaque sous-traitant ultérieur (PaaS, SMTP).

## 2. Registre des traitements (modèle, art. 12 nLPD / art. 30 RGPD)

| # | Traitement | Finalité | Personnes concernées | Données | Base légale | Destinataires | Durée | Mesures |
|---|---|---|---|---|---|---|---|---|
| T1 | Gestion des comptes | Authentifier, gérer les accès | Utilisateurs | E-mail, nom, mot de passe haché, secret TOTP chiffré, langue | Contrat / intérêt légitime | Éditeur | Compte actif + 30 j | Argon2id, MFA |
| T2 | Planification et convocations | Convoquer aux séances | Membres, invités | Nom, e-mail, RSVP | Contrat (client) | SMTP | Selon le tenant (défaut 10 ans) | TLS, SPF/DKIM |
| T3 | PV et notes | Documenter les délibérations | Membres, tiers cités | Nom, propos, décisions, votes | Obligation légale du client / intérêt légitime | Membres autorisés | 10 ans par défaut (configurable) | RLS, ACL, immutabilité |
| T4 | Décisions et actions | Tracer et suivre | Membres | Nom, texte, échéances | Idem | Idem | Idem | Idem |
| T5 | Registre des risques | Gouvernance | Responsables de risques | Nom, évaluations | Intérêt légitime du client | Membres autorisés | Selon tenant | Idem |
| T6 | Conflits d'intérêts | Prévention | Membres | Déclarations (potentiellement sensibles) | Obligation légale / intérêt légitime | Président, secrétaire | Durée du mandat + 5 ans | Accès restreint |
| T7 | Journal d'audit | Sécurité, preuve | Utilisateurs | ID, action, horodatage, adresse IP tronquée | Intérêt légitime | Admin du tenant | 3 ans | Append-only |
| T8 | Journaux techniques | Exploitation | Utilisateurs | IP, user-agent, ID requête | Intérêt légitime | Éditeur | 30 jours | Pas de contenu métier |
| T9 | Sauvegardes | Continuité | Toutes | Toutes | Intérêt légitime | PaaS | 35 jours glissants | Chiffrement |

**Données sensibles** : les propos d'un PV peuvent révéler des opinions politiques, syndicales ou de santé (art. 5 nLPD). Le client en est responsable ; l'éditeur fournit des ACL par document et par point (« confidentiel »). **Analyse d'impact (AIPD/art. 22 nLPD, art. 35 RGPD)** : à évaluer avant commercialisation (volumétrie et sensibilité).

## 3. Sous-traitants ultérieurs (à instancier)

| Fonction | Fournisseur (reco) | Localisation | Statut DPA |
|---|---|---|---|
| Hébergement + base + S3 | Clever Cloud (ADR-0007) | UE (France) | À conclure |
| SMTP transactionnel | Brevo / Scaleway TEM / Infomaniak | UE / CH | À conclure |
| GitHub (code uniquement, **aucune donnée de production**) | GitHub (Microsoft) | US | Hors périmètre des données clients : seules des données synthétiques en staging |
| IA (V2) | À choisir, UE/CH uniquement, désactivable par tenant, sans entraînement | UE/CH | V2 |

Transferts hors UE/CH : aucun pour les données de production.

## 4. Droits des personnes

| Droit | Mise en œuvre |
|---|---|
| Accès (art. 25 nLPD / 15 RGPD) | Export des données d'un utilisateur par l'admin du tenant (V2) ; au MVP, procédure manuelle documentée |
| Rectification | Profil modifiable. Contenus approuvés : rectificatif (jamais de modification silencieuse) |
| Effacement | Compte : anonymisation du profil. Contenus immuables : **les personnes sont référencées par identifiant**, l'identité est remplacée par « Ancien membre #n » ; le texte du PV est conservé si une obligation de conservation s'applique (à valider avec le client) |
| Portabilité | Export JSON + PDF + fichiers (V2) |
| Opposition / limitation | Demande traitée par le responsable (client) ; support éditeur |

## 5. Conservation

| Donnée | Durée par défaut | Fin de vie |
|---|---|---|
| PV approuvés, décisions | 10 ans après clôture (alignée sur art. 958f CO par prudence ; associations : paramétrable, jusqu'à « illimité ») | Purge sur validation de l'admin, avec journal |
| Documents annexés | Durée du PV auquel ils se rattachent | Idem |
| Notes de séance brutes | 1 an après approbation du PV (paramétrable) | Purge automatique |
| Comptes inactifs | 24 mois sans connexion ⇒ avertissement puis anonymisation | Job planifié |
| Journal d'audit | 3 ans | Purge par partitions mensuelles |
| Journaux techniques | 30 jours | Rotation |
| Sauvegardes | 35 jours | Rotation par le PaaS |

## 6. Violation de données
1. Détection (alertes) ⇒ 2. qualification (risque pour les personnes ?) ⇒ 3. confinement (révocation de sessions, rotation de secrets) ⇒ 4. notification au client sous 24 h (le client notifie le PFPDT « dans les meilleurs délais » ou l'autorité UE sous 72 h) ⇒ 5. registre des incidents + retour d'expérience.

## 7. Export complet d'une organisation (V2, conçu dès le MVP)
Job asynchrone `tenant-export` déclenché par l'admin (ré-authentification MFA). Contenu de l'archive ZIP chiffrée (lien de téléchargement à usage unique, 7 jours) :
- `data/*.json` par entité (organes, mandats, séances, ODJ, notes, PV (toutes versions), décisions, votes, risques, actions, conflits, audit) ;
- `files/` : tous les documents et PDF ;
- `manifest.json` : liste, tailles, SHA-256, version du schéma ; `README` décrivant le format.
Journalisé dans l'audit ; aucune donnée d'un autre tenant (test d'isolation dédié).

## 8. Suppression d'un tenant
1. Demande de l'admin avec ré-authentification MFA + proposition d'exporter d'abord.
2. **Phase de grâce de 30 jours** : tenant gelé (lecture seule), annulation possible.
3. Purge : suppression des lignes du tenant (jobs spéciaux sous rôle de maintenance journalisé, qui suspend temporairement les triggers d'immutabilité via fonction `SECURITY DEFINER` dédiée à la purge de tenant), suppression du préfixe S3 `tenants/{id}/`, révocation des sessions, anonymisation des comptes qui n'appartiennent à aucun autre tenant.
4. Les sauvegardes expirent sous 35 jours : le client en est informé ; en cas de restauration, la purge est rejouée (liste des tenants supprimés conservée, sans contenu).
5. Attestation de suppression (date, périmètre, hash du manifeste) remise à l'admin ; seule trace conservée : identifiant du tenant, dates, attestation.

## 9. Exigences de forme des PV (à faire valider juridiquement)
- **Société anonyme (art. 713 CO, après révision 2023)** : le procès-verbal des délibérations et décisions du conseil d'administration est tenu et signé par le président et le secrétaire ; les décisions par voie de circulation sont possibles (V2). Les contenus minimaux de la page de PV : organe, date, lieu, présents/absents/excusés, ordre du jour, décisions et résultats des votes, signature(s). **Conséquence pour le MVP** : le PDF porte un bloc de signature vide pour une signature manuscrite ou qualifiée hors outil.
- **Association (art. 60 ss CC)** : le fonctionnement est défini par les **statuts** ; l'application rend configurables par organe : quorum, majorité, délai de convocation, contenu du PV. Elle n'impose aucune règle légale à la place des statuts.
- Chaque organe peut porter un champ « référence statutaire » (texte libre) affiché dans le PV.
