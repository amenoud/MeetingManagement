# Runbook – Sauvegarde et restauration de la base

> Statut : **prouvé en local** (OPS-03, 2026-11-14). **Non encore prouvé sur l'hébergeur** : à rejouer en incrément 0b. Tant que ce n'est pas fait, ne pas considérer la production comme sauvegardée.

## 1. Ce que couvre cette procédure

- Export logique (`pg_dump`, format custom) d'**une base** : tables, propriétaires, droits, RLS forcée, politiques, fonctions, données.
- Restauration sur un **serveur neuf et vide** (le serveur a disparu) ou dans une **nouvelle base** d'un serveur existant.

**Ne couvre pas** : sauvegarde automatique planifiée, restauration à un instant donné (PITR), chiffrement, copie hors site, rétention de 35 jours (`docs/08-conformite.md`), fichiers S3. Tout cela relève de l'incrément 0b (hébergeur).

## 2. Qui décide, quand

Le propriétaire du produit décide de restaurer. Cas typiques : serveur perdu, corruption de données, erreur humaine (suppression). **Ne jamais restaurer par-dessus une base existante** : on restaure dans une **nouvelle** base, on vérifie, puis on bascule l'application.

## 3. Sauvegarde

```bash
pnpm db:backup          # écrit backups/<base>-<horodatage>.dump (ignoré par Git)
```

- Utilise `DATABASE_ADMIN_URL` (compte capable de lire toutes les lignes).
- **Le fichier contient des données personnelles** : ne pas le committer, ne pas le partager, ne pas le laisser sur un poste non protégé. Il n'est **pas chiffré** (limite connue). En développement, les données sont synthétiques.
- Les **rôles et leurs mots de passe ne sont pas dans l'export** : ils sont recréés par `db:bootstrap` à partir des chaînes de connexion.

## 3 bis. Restauration sur un serveur neuf

Variables : `DATABASE_ADMIN_URL`, `DATABASE_URL` (rôle `app_rw`), `DATABASE_MIGRATOR_URL` (rôle `app_migrator`) pointant vers le **nouveau** serveur.

| #   | Étape                                    | Commande                                           | Pourquoi                                                                                                                                                                                      |
| --- | ---------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Démarrer un serveur PostgreSQL 16 vide   | hébergeur, ou `docker compose up -d db`            |                                                                                                                                                                                               |
| 2   | Créer **les rôles seulement**            | `pnpm db:bootstrap --roles-only`                   | Le dump nomme les propriétaires : les rôles doivent exister. **Pas** le bootstrap complet : il créerait les schémas et le dump échouerait (« schema already exists »)                         |
| 3   | Restaurer dans une **nouvelle** base     | `pnpm db:restore backups/<fichier>.dump <nom_base>` | Refuse si la base existe ; s'arrête à la première erreur ; un fichier tronqué ou invalide **échoue**                                                                                          |
| 4   | Réappliquer droits et réglages           | `pnpm db:bootstrap`                                | Réglages de rôle (`search_path`, délais), droits sur la base : ils ne sont pas dans l'export                                                                                                  |
| 5   | Vérifier les données                     | `pnpm db:verify-restore <base_source> <nom_base>`  | Nombre de lignes et empreinte du contenu de chaque table, puis audit d'isolation de la copie                                                                                                  |
| 6   | Contrôler l'isolation                    | `pnpm db:audit` (avec `DATABASE_ADMIN_URL` visant la base restaurée) | RLS, politiques, droits préservés                                                                                                                                       |
| 7   | Basculer l'application                   | pointer `DATABASE_URL` vers la base restaurée, redémarrer | Seulement si 5 et 6 sont verts                                                                                                                                                         |

Si la base source n'existe plus, l'étape 5 est remplacée par : comparer les nombres de lignes attendus (dernier rapport connu) et exécuter l'étape 6 et un parcours applicatif de recette.

## 4. Critères de réussite

- Étapes 3 à 6 sans erreur ; `db:verify-restore` : « identical data, isolation audit clean ».
- Chaque organisation ne voit que ses propres lignes (contrôle applicatif : `app_rw` + `withTenant`).
- Les durées sont consignées (§6).

## 5. Après une restauration (obligatoire)

- **Rejouer les suppressions d'organisation** survenues après la date de la sauvegarde (`docs/08-conformite.md` §8.4) : une organisation supprimée ne doit pas réapparaître. Tenir la liste des tenants supprimés (identifiants et dates, sans contenu).
- Si la cause est une compromission : **renouveler les secrets** et les mots de passe de rôles, et invalider les sessions.
- Informer les clients concernés selon la procédure de violation de données (§6 de `docs/08-conformite.md`) si des données ont pu fuiter.
- Consigner l'incident et la durée réelle.

## 6. Exercice de sinistre : résultat mesuré

`pnpm db:drill` (Docker requis, ne touche pas à la base de développement) : serveur A jetable → rôles, migrations, tables conformes, données de 2 organisations (40 000 parents + 40 000 enfants) → empreinte + sauvegarde → **serveur A supprimé** → serveur B **neuf et vide** → étapes 1 à 7 ci-dessus.

| Date       | Volume                        | Sauvegarde | Récupération (étapes 1 à 7)                                         | Résultat                                                                                                              |
| ---------- | ----------------------------- | ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 2026-11-14 | dump de 2,7 Mo, 80 000 lignes | 1,2 s      | **5,4 s** (dont 3,0 s de démarrage du serveur, restauration 1,2 s) | **réussi** : 5 tables identiques, audit d'isolation propre, chaque organisation voit ses 20 000 lignes |

Contre-épreuve : en supprimant une ligne après la restauration, l'exercice **échoue** (code 1) et nomme la table (`row_count app.aud_child`).

**Ne pas extrapoler ces durées à la production** : volume minuscule, disque local, aucun réseau. Le RTO réel se mesure sur l'hébergeur (0b). Objectifs visés (`docs/07-menaces-securite.md`) : RPO ≤ 24 h (≤ 15 min avec PITR), RTO ≤ 4 h.

## 7. Dépannage

| Symptôme                                         | Cause probable                                   | Action                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `role "app_migrator" does not exist`             | Étape 2 oubliée                                  | `pnpm db:bootstrap --roles-only` puis relancer l'étape 3 dans une **nouvelle** base                                     |
| `schema "app" already exists`                    | Bootstrap complet exécuté avant la restauration  | Supprimer la base cible, la recréer, refaire à partir de l'étape 2                                                      |
| `pg_restore failed … unexpected end of file`     | Fichier tronqué ou corrompu                      | Utiliser une autre sauvegarde ; vérifier la taille et la source du fichier                                              |
| `pg_dump: command not found`                     | Pas d'outils PostgreSQL sur le poste             | En local, ils s'exécutent dans le conteneur `db` (`docker compose up -d db`) ; ailleurs, installer le client PostgreSQL 16 |
| `pg_dump N is newer than the PostgreSQL M server` ou `unrecognized configuration parameter "transaction_timeout"` | Client **plus récent** que le serveur : il écrit des réglages que le serveur ne connaît pas, le dump est **non restaurable** (constaté en CI) | Utiliser les outils PostgreSQL de **la même version majeure** que le serveur : `PG_TOOLS_IMAGE=postgres:16-alpine` (outils exécutés dans l'image), `PG_BIN_DIR=<dossier des binaires 16>`, ou le conteneur `db`. `db:backup` refuse désormais de créer un tel dump |
| `db:verify-restore` signale `row_count` / `content` | Restauration incomplète ou base modifiée       | Ne pas basculer ; refaire la restauration dans une nouvelle base                                                        |
