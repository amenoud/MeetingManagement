# PLAN-OPS-03 – Sauvegarde et restauration (locale), runbook et exercice

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (**AC27**, version « adaptée local ») · `docs/07-menaces-securite.md` (sauvegardes) · `docs/08-conformite.md` §8 · Issue : OPS-03 · Taille : M-L
- Branche : `ops/ops-03-restore` · Dépend de : DB-01, DB-02, TST-01 (faits)

## 1. Pourquoi, et ce que cela prouve (et ne prouve pas)
Principe du cadrage : une sauvegarde n'existe que si **sa restauration a été exécutée et vérifiée**. On le prouve avant d'avoir des données à perdre.

- **Prouvé ici** : un export logique (`pg_dump`) se restaure dans une base vide, **avec** propriétaires, droits, RLS forcée, politiques et réglages ; les données sont identiques ; l'application (`app_rw` + `withTenant`) fonctionne sur la base restaurée ; une sauvegarde tronquée est détectée.
- **Non prouvé ici (incrément 0b, quand l'hébergeur existe)** : les sauvegardes automatiques du PaaS, la restauration à un instant donné (PITR), les durées réelles de production. Le runbook le dit explicitement.

## 2. Constat
- `pg_dump`/`pg_restore` ne sont **pas installés sur votre poste Windows** ; ils existent dans le conteneur `db` (PostgreSQL 16). Les outils s'exécuteront donc **dans le conteneur** en local, et **directement** là où ils existent (runners GitHub).
- Le schéma de production `app` ne contient **encore aucune table** : restaurer un schéma vide ne prouverait presque rien. L'exercice utilise donc des **tables de test conformes** (fixtures) remplies de données de deux organisations.

## 3. Livrables
| Élément | Contenu |
|---|---|
| `src/platform/db/backup.ts` | `dumpDatabase(url, fichier)` et `restoreDatabase(url, fichier)` : format **custom** (`-Fc`), propriétaires et droits conservés ; choix automatique de l'outil (local ou conteneur `db`) ; mot de passe jamais dans la ligne de commande ni les journaux |
| `src/platform/db/verify-restore.ts` | `compareDatabases(source, restaurée)` : mêmes migrations (noms + checksums), mêmes tables, **même nombre de lignes et même empreinte du contenu** par table ; liste des écarts |
| Scripts | `pnpm db:backup`, `pnpm db:restore <fichier> <base>`, `pnpm db:verify-restore`, `pnpm db:drill` |
| `docs/runbooks/restore.md` | Procédure pas à pas (sinistre = nouveau serveur vide) : créer le serveur → `db:bootstrap` (les rôles ne sont pas dans l'export) → `db:restore` → `db:verify-restore` + `db:audit` → remettre l'application ; durées mesurées ; qui décide ; quoi vérifier ; **ce que la procédure ne couvre pas** |
| `.gitignore` | `backups/`, `*.dump` (une sauvegarde contient des données personnelles) |
| Tests | voir §4 |

## 4. Exercice et tests (PostgreSQL réel)
**A. Test d'intégration (dans la CI)** : base source = migrations + tables conformes + données de **deux** organisations (via `withTenant`) → sauvegarde → restauration dans une **nouvelle base** → vérification :
1. comparaison complète sans écart (migrations, lignes, empreintes) ;
2. `auditIsolation` **sans constat** sur la base restaurée (RLS forcée, politiques, droits préservés) ;
3. via `app_rw` : `withTenant(A)` ne voit que A, `withTenant(B)` que B ; hors contexte 0 ligne ; `TRUNCATE` refusé ; le propriétaire sans contexte ne voit rien ;
4. une **sauvegarde tronquée** fait échouer la restauration (pas de succès silencieux) ;
5. **test du vérificateur** : si je supprime une ligne ou modifie une valeur dans la base restaurée, `compareDatabases` le signale (preuve qu'il n'est pas vacuant).

**B. Exercice de sinistre complet (`pnpm db:drill`, local)** : démarre un **serveur PostgreSQL neuf et vide** (conteneur jetable sur un port libre), y rejoue le runbook réel (`bootstrap` des rôles, restauration, vérifications), mesure et affiche les durées, puis supprime le conteneur. C'est le scénario « le serveur a disparu ». Résultat consigné dans le runbook (date, volumes, durées).

## 5. Écarts et choix à valider
1. **A + B** (test dans la CI **et** exercice de sinistre local) plutôt que A seul. Reco : oui ; B est le seul à prouver la reprise sur serveur vide, y compris le rôle des réglages de rôle (`ALTER ROLE … SET`) qui ne sont pas dans l'export.
2. **Format et portée** : export custom, propriétaires/droits conservés, **rôles recréés par `db:bootstrap` avant la restauration** (pas d'export des rôles ni de mots de passe). Reco : oui.
3. **Outils manquants ⇒ le test échoue** (pas de « skip » silencieux). En CI, si `pg_dump` manque sur le runner, j'ajoute l'installation du client PostgreSQL 16. Reco : oui.
4. **Sauvegardes non chiffrées en local**, ignorées par Git, avec avertissement dans le runbook ; chiffrement et rétention (35 jours, `08-conformite.md`) traités avec le PaaS en 0b. Reco : oui. Risque assumé : un fichier `.dump` local contient des données ; en développement elles sont synthétiques.

## 6. Risques
- **Redirection binaire sous Windows** (sortie de `pg_dump` en flux) : j'écris/lis les fichiers côté Node, sans passer par un shell ; testé sur votre machine.
- **Version du client** : le client doit être de version ≥ celle du serveur ; local = même conteneur (16), CI = PostgreSQL 16.
- **Données personnelles dans les sauvegardes** : traitées en §5.4 ; la règle de `08-conformite.md` §8.4 (rejouer la purge d'un tenant supprimé après une restauration) est reprise dans le runbook.
- **Faux sentiment de sécurité** : le runbook distingue clairement « prouvé en local » de « à prouver sur l'hébergeur ».
- **Durée de la CI** : un export/restauration de petites tables ajoute quelques secondes.

## 7. Hors périmètre
Sauvegarde automatique planifiée, PITR, chiffrement, copie hors site, rétention (0b) ; sauvegarde des fichiers S3 (à l'issue du stockage de fichiers) ; `verify:chain` du journal d'audit (AUD-01 : la comparaison par empreinte de table couvrira ses lignes en attendant).

## 8. Critère de fin
AC27 prouvé : exécution réelle du runbook, vérifications vertes, durées mesurées et consignées ; test d'intégration vert en CI ; mutation du vérificateur détectée.
