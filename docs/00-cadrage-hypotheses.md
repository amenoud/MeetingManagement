# 00 – Cadrage : réponses, hypothèses, risques

> Date : 2026-11-12. Statut : à valider (gate G0).
> Légende : **FAIT** = fourni par le porteur. **HYPOTHÈSE (Hn)** = interprétation à confirmer. **RECO** = recommandation.

## 1. Réponses du porteur (FAITS)

| # | Sujet | Réponse |
|---|---|---|
| 1 | Cible | Usage personnel d'abord, commercialisation ensuite |
| 2 | Équipe | 1 personne + Claude Code |
| 3 | Délai / infra | MVP en 2 mois, infrastructure la plus légère possible |
| 4 | Périmètre MVP | « Tout » (les 6 fonctionnalités demandées) |
| 5 | Stack | Aucune contrainte |
| 6 | Signature | Pas de signature électronique pour l'instant |
| 7 | Hébergement | Pas d'exigence « Suisse uniquement » ; pas de sous-traitants américains |
| 8 | Visio | Pas d'intégration Teams/Zoom/Meet |
| 9 | Auth | Pas de SSO ; uniquement login + mot de passe |
| 10 | Langues | FR / DE / EN dès le départ |

## 2. Hypothèses retenues (à confirmer ou corriger)

- **H1 – Multitenance dès le départ, facturation plus tard.** Même en usage personnel, on construit le modèle multitenant (coût marginal faible, refonte ultérieure très coûteuse). Pas de facturation, plans ni CGU dans le MVP.
- **H2 – Capacité : 10 à 15 h/semaine** (non communiqué). Voir risque R1.
- **H3 – Date MVP : 2027-01-15** (2 mois à partir du 2026-11-16), plus 2 semaines de tampon.
- **H4 – « Tout » = les 6 fonctionnalités, en tranches fines (« thin slices »).** Chaque fonctionnalité existe de bout en bout mais sans options avancées. La liste des coupes est au §4.
- **H5 – Stack : TypeScript full-stack** (RECO, voir ADR-0001).
- **H6 – Pas de signature = approbation attestée.** Le PV est « approuvé » par action authentifiée du président et du secrétaire (horodatée, hachée). Le PDF contient un **bloc de signature vide** pour signature manuscrite hors outil si l'exigence légale (art. 713 CO pour les SA) le requiert. Ce point relève d'un avis juridique, voir R3.
- **H7 – Hébergement UE ou Suisse, aucun sous-traitant soumis au droit américain** (pas de Fly.io, Render, Heroku, Vercel, AWS/GCP/Azure, Postmark, SendGrid, OpenAI, etc.). La réponse 7 contenait deux questions ; « non » est interprété pour les deux.
- **H8 – Séance en ligne = champ « lien de visioconférence » libre.** Aucune intégration.
- **H9 – Login = e-mail + mot de passe, avec MFA TOTP.** Le MFA figurait dans le brief initial ; il est conservé (optionnel par utilisateur, imposable par l'admin du tenant). Pas de passkeys ni de SSO au MVP.
- **H10 – i18n :** interface, e-mails, PDF et notifications en FR/DE/EN. Le contenu saisi (notes, décisions) reste dans la langue de saisie, sans traduction automatique.
- **H11 – Infra légère :** 1 conteneur + 1 PostgreSQL managé + 1 stockage objet S3 + 1 SMTP. Aucun Redis, aucune file externe, aucun Kubernetes.
- **H12 – IA : hors MVP.** Elle impliquerait un sous-traitant UE (H7) et alourdit le périmètre.

## 3. Risques majeurs

| ID | Risque | Proba | Impact | Réponse |
|---|---|---|---|---|
| R1 | **Périmètre « tout » incompatible avec 2 mois à 10-15 h/sem** (≈ 90-130 h ; la complexité est dans PV, droits, RLS, i18n) | Haute | Haute | Tranches fines, liste de coupes ordonnée (§4), tampon de 2 semaines, gates courts. Si capacité < 15 h/sem, repousser le MVP plutôt que sacrifier l'isolation ou l'immutabilité |
| R2 | Fuite inter-tenants (RLS mal configurée, connexion poolée mal réinitialisée) | Moyenne | Critique | ADR-0002 : rôle applicatif non propriétaire, `SET LOCAL` transactionnel, tests d'isolation en CI bloquants |
| R3 | Validité juridique du PV sans signature qualifiée | Moyenne | Moyenne | Avis juridique avant commercialisation ; PDF avec bloc de signature ; intégration signature en V2 |
| R4 | Coûts GitHub : CodeQL/secret scanning et environnements protégés sur dépôt **privé** exigent des plans payants | Haute | Faible | Voir `09-github-ci-cd.md` §1 (options) |
| R5 | Dérive de l'agent IA (code non maintenable, tests creux) | Moyenne | Moyenne | Processus ADLC (`10-processus-adlc.md`), gates humains, CLAUDE.md |
| R6 | Dépendance à un PaaS petit acteur (UE) | Faible | Moyenne | Conteneur standard + Postgres standard + S3 : portabilité (ADR-0007) |

## 4. Liste des coupes (ordre de sacrifice si le délai glisse)

1. Observateur et droits par document ramenés à « hérite de l'organe » (ACL fine en V2).
2. Modèles d'ODJ et points récurrents (garder la copie manuelle d'une séance précédente).
3. Récurrence de séances (garder la création en série simple : N occurrences).
4. Matrice de risques graphique (garder le tableau trié par criticité).
5. Journal d'audit : consultation simplifiée (liste filtrable, sans export).
6. Notifications configurables (garder des rappels fixes).
7. **Intouchables** : isolation tenant, immutabilité PV/décisions, MFA, sauvegardes testées, i18n des textes de base.
