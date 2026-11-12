# 04 – Matrice rôles × permissions

## 1. Deux niveaux de rôles

- **Niveau organisation** (`membership.org_role`) : `org_admin` ou `user`. L'admin gère le tenant mais n'obtient **pas** automatiquement l'accès au contenu des organes (séparation des pouvoirs ; il doit détenir un mandat pour lire).
- **Niveau organe** (`mandate.body_role`) : `chair`, `secretary`, `member`, `guest`, `observer`. Un utilisateur peut avoir des rôles différents dans des organes différents, et un mandat borné dans le temps.

Un droit n'existe que si : (1) le tenant courant est celui de l'utilisateur (RLS), (2) un mandat actif ou un rôle d'organisation l'autorise (politique applicative centralisée dans `src/server/authz`), (3) pour un document, l'ACL le permet.

## 2. Matrice (par organe)

Légende : ✅ oui · ❌ non · 🔸 conditionnel (voir notes) · 👁 lecture seule.

| Ressource / action | Admin org | Président | Secrétaire | Membre | Invité | Observateur |
|---|---|---|---|---|---|---|
| **Tenant** : paramètres, utilisateurs, rôles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Organes** : créer / modifier | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Mandats** : attribuer / clore | ✅ | 🔸 (1) | ❌ | ❌ | ❌ | ❌ |
| **Journal d'audit** : consulter | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Séance** : créer / modifier / annuler | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Séance** : voir | ❌ | ✅ | ✅ | ✅ | 🔸 (2) | 👁 |
| **Convocation** : envoyer | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **RSVP** : répondre | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **ODJ** : créer / ordonner / modifier | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **ODJ** : proposer un point | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **ODJ** : valider / refuser un point proposé | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Modèles d'ODJ** : gérer | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Conduite** : ouvrir, constater présences/quorum | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Notes de séance** : écrire | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Vote** : ouvrir / clore | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Vote** : voter | ❌ | ✅ | ✅ | ✅ (3) | ❌ | ❌ |
| **PV** : rédiger (brouillon) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **PV** : relire / commenter | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **PV** : approuver (attestation) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **PV approuvé** : lire / exporter PDF | ❌ | ✅ | ✅ | ✅ | ❌ | 👁 |
| **PV** : créer un rectificatif | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Décisions** : voir / rechercher | ❌ | ✅ | ✅ | ✅ | 🔸 (2) | 👁 |
| **Décisions** : créer (via vote clos) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Décisions** : lier (modifie/abroge) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Décisions** : modifier / supprimer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Risques** : voir | ❌ | ✅ | ✅ | ✅ | ❌ | 👁 |
| **Risques** : créer / modifier | ❌ | ✅ | ✅ | 🔸 (4) | ❌ | ❌ |
| **Actions** : voir | ❌ | ✅ | ✅ | ✅ | 🔸 (5) | 👁 |
| **Actions** : créer / réassigner | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Actions** : mettre à jour son statut | ❌ | ✅ | ✅ | ✅ (6) | ✅ (6) | ❌ |
| **Conflit d'intérêts** : déclarer (soi) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Conflit** : voir toutes les déclarations | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Documents** : voir | selon ACL | selon ACL | selon ACL | selon ACL | selon ACL | selon ACL |
| **Documents** : téléverser | ❌ | ✅ | ✅ | 🔸 (7) | ❌ | ❌ |
| **Documents** : modifier l'ACL | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Tableau de bord** | ❌ | ✅ | ✅ | ✅ | ❌ | 👁 |

### Notes

1. Le président peut proposer un mandat ; l'admin org l'applique (évite l'auto-attribution de pouvoirs). Décision de conception à valider.
2. L'invité voit **uniquement** les séances auxquelles il est convoqué, et les points explicitement marqués « visibles pour invités » ; jamais le reste du PV.
3. Un membre récusé sur un point ne peut pas voter sur ce point (contrôle serveur). Un mandat `voting = false` ne vote pas.
4. Un membre peut proposer un risque (statut `proposed`) ; le président ou secrétaire le valide.
5. Uniquement les actions dont il est responsable.
6. Uniquement ses propres actions.
7. Seulement sur un point où il est rapporteur.

## 3. Droits fins par document

`document_acl(subject_type, subject_id, permission)` avec `subject_type ∈ {body, user, body_role}` et `permission ∈ {read, write, manage}`. Règle de résolution : **refus par défaut**, union des autorisations explicites, hiérarchie `manage > write > read`. Un document attaché à un point d'ODJ hérite l'accès des participants de la séance, mais l'ACL peut le restreindre (ex. note confidentielle visible du seul président). Un PV approuvé hérite de l'ACL de l'organe (lecture seule).

## 4. Règles transverses

- Aucun rôle ne peut modifier ou supprimer une décision, un PV verrouillé, une approbation, un journal d'audit.
- Le dernier admin d'une organisation ne peut pas être rétrogradé ni supprimé.
- Toute vérification de droit passe par `authz.can(user, action, resource)` ; les routes n'implémentent jamais de test de rôle en ligne. Chaque route possède un test « refus » par rôle non autorisé (généré depuis cette matrice).
- Changements de rôle, mandats et ACL sont écrits au journal d'audit.
