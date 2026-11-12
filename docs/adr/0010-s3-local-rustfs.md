# ADR-0010 – S3 de développement local : RustFS

- Statut : accepté (2026-11-12)
- Lié : ADR-0005 (stockage de fichiers), PLAN-INF-03

## Contexte
Le développement local a besoin d'un stockage compatible S3. MinIO était le choix prévu, mais l'image `minio/minio` n'est plus tirable depuis Docker Hub (« repository does not exist ») et le registre quay.io répond 401.

## Options essayées
| Option | Résultat |
|---|---|
| MinIO (`minio/minio`, `quay.io/minio/minio`) | Image indisponible |
| SeaweedFS (`chrislusf/seaweedfs`) | Fonctionne, mais image de 1,08 Go |
| Garage (`dxflrs/garage`) | Fonctionne, mais exige une configuration et une initialisation de la topologie |
| **RustFS (`rustfs/rustfs`)** | Démarre avec deux variables d'environnement, création de bucket et de listing validés avec le client AWS CLI |

## Décision
**RustFS** pour le développement local et la CI uniquement. Le code applicatif n'utilise que l'API S3 standard via un adaptateur (ADR-0005) : le fournisseur de production (stockage objet du PaaS) reste interchangeable.

## Conséquences
- Région locale : `us-east-1` (RustFS rejette une autre région à la création de bucket). La région est une variable de configuration (`S3_REGION`).
- Le tag `latest` est utilisé en local ; l'épinglage par version ou digest est fait à l'incrément INF-05 (Dependabot) et avant toute utilisation en CI.
- RustFS est un projet jeune : si des incompatibilités S3 apparaissent, basculer vers Garage ou SeaweedFS sans impact sur le code applicatif.
- À reverifier : l'adaptateur S3 devra être testé contre le stockage réel du PaaS avant la production (incrément 0b).
