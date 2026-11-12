# ADR-0007 – Hébergement PaaS

- Statut : proposé (**les prix sont indicatifs et à revérifier sur les sites avant décision**)
- Date : 2026-11-12

## Critères
Données en Suisse ou UE (FAIT) ; **aucun sous-traitant soumis au droit américain** (H7) ; conteneur Docker + PostgreSQL managé + déploiement par GitHub Actions ; ops minimales ; sauvegardes automatiques avec restauration point-in-time si possible.

## Options

| | A. **Clever Cloud** (France) | B. **Scalingo** (France) | C. **Infomaniak** (Suisse, Public Cloud / PaaS) ou **Exoscale** (Suisse/UE) |
|---|---|---|---|
| Modèle | PaaS ; application Docker ou runtime Node ; add-on PostgreSQL managé ; stockage objet S3 (Cellar) | PaaS ; déploiement Git/Docker ; add-on PostgreSQL managé | Infomaniak : cloud public Swiss-made, conteneurs/Kubernetes managé et DBaaS ; Exoscale : DBaaS PostgreSQL managé, stockage objet SOS, instances ou Kubernetes |
| Données | UE (Paris) | UE (Paris/Amsterdam) | Suisse |
| S3 inclus | Oui (Cellar) | Non (à prendre ailleurs en UE, ex. Scaleway) | Oui |
| Ops à votre charge | Très faible | Très faible | Moyen (plus de composants à assembler : conteneur, réseau, TLS) |
| Coût mensuel indicatif staging + prod, minimal | ≈ 40–100 € | ≈ 50–110 € (+ S3) | ≈ 70–150 CHF |
| Risque principal | Acteur de taille moyenne | Idem + 2ᵉ fournisseur pour S3 | Charge d'exploitation plus élevée pour une personne seule |

## Décision (recommandation)
**Option A (Clever Cloud)** pour le MVP : le plus léger à exploiter, S3 inclus, UE. Portabilité préservée : conteneur standard, PostgreSQL standard, S3 standard, SMTP standard (aucune API propriétaire). **Plan de repli : option C** (Suisse) si un client exige des données en Suisse ; le coût de bascule est une journée d'ops + migration de données.

À faire avant la décision finale (issue incrément 0) : (1) vérifier les prix et les SLA ; (2) confirmer la restauration à un instant donné (PITR) et la rétention des sauvegardes ; (3) conclure l'accord de sous-traitance (DPA) ; (4) tester le déploiement d'un conteneur « hello » avec Postgres et S3 en moins d'une demi-journée.

## Environnements
- **Production** : application + PostgreSQL (plan avec sauvegardes quotidiennes + PITR) + bucket.
- **Staging** : plan minimal (peut être éteint hors usage), données synthétiques uniquement.
- **Développement** : `docker compose` local (PostgreSQL, MinIO, Mailpit).

## Conséquences
Un seul conteneur se déploie (image dans GHCR ou registre du PaaS). Les secrets sont variables d'environnement du PaaS, alimentées par les secrets d'environnement GitHub.
