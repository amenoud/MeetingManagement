# PLAN-INF-04 – Workflow CI GitHub Actions

- Statut : **proposé – en attente de G2**
- Spec : SPEC-000 (AC3, AC6, AC7 ; renforce AC1, AC15, AC16) · Issue : INF-04 · Taille : M
- Branche : `ci/inf-04-workflow` · Dépend de : INF-01, INF-03 (faits)

## 1. Périmètre
Un workflow `ci.yml` qui rejoue sur GitHub ce qui est aujourd'hui vérifié seulement sur votre machine, puis **rend ces vérifications obligatoires** pour fusionner dans `main`. Hors périmètre : CodeQL, détection de secrets, Dependabot, trivy (INF-05) ; PostgreSQL de test et tests d'isolation (DB-01/TST-01) ; déploiement (incrément 0b).

## 2. Jobs
Noms stables (ce sont eux que le ruleset exigera) :

| Job | Contenu | Durée visée |
|---|---|---|
| `quality` | `pnpm install --frozen-lockfile --ignore-scripts`, `lint`, `format:check`, `typecheck`, `depcruise`, contrôle des actions épinglées, `actionlint` | < 2 min |
| `unit` | `pnpm test:unit` (Vitest + couverture), publication du rapport de couverture en artefact | < 2 min |
| `docker` | `pnpm test:docker` (AC15/AC16 : PostgreSQL, S3, Mailpit, image non root, taille) | < 6 min |
| `build` | `docker build`, génération du **SBOM CycloneDX** (AC7), dépôt en artefact | < 4 min |

Règles communes : déclencheurs `pull_request` et `push` sur `main` (**jamais** `pull_request_target`) ; `permissions: contents: read` au niveau du workflow ; `concurrency` avec annulation des exécutions obsolètes ; `timeout-minutes` sur chaque job ; Node lu depuis `.nvmrc`, pnpm depuis `packageManager` ; cache pnpm ; aucun secret requis.

## 3. Épinglage des actions (AC6)
- Chaque `uses:` est épinglé par **SHA de 40 caractères**, avec le tag en commentaire (`# v4.x.y`). Je résous les SHA **au moment de l'exécution** avec `gh api` (je ne les connais pas d'avance) et je vérifie que chaque SHA correspond bien au tag annoncé.
- Script `scripts/check-actions-pinned.mjs` + test Vitest : échoue si un `uses:` n'est pas un SHA (exception : actions locales `./`). Inclus dans `quality`.
- Les mises à jour des SHA passeront par Dependabot (INF-05).

## 4. SBOM (AC7)
Outil : commande native `pnpm sbom --sbom-format cyclonedx` (constatée disponible dans pnpm 11.13.1 le 2026-11-12 ; pas de dépendance supplémentaire). Sortie `sbom.cdx.json` en artefact du job `build` (rattachement aux releases : issue ultérieure). Je vérifie que le fichier est un CycloneDX valide (champs `bomFormat`, `components`).

## 5. Rendre la CI bloquante (AC3)
Les noms de checks n'existent pour GitHub qu'après une première exécution. Séquence :
1. PR d'INF-04 : la CI s'exécute sur la PR elle-même (preuve de fonctionnement).
2. **Après merge**, j'ajoute au ruleset `protect-main` la règle « checks requis » : `quality`, `unit`, `docker`, `build`, avec « branche à jour » exigée. **C'est un changement de réglage de votre dépôt : je le ferai seulement avec votre accord explicite.**
3. Preuve AC3 : une PR jetable avec une erreur de lint volontaire ; je vérifie que le check est rouge et que le merge est refusé par GitHub, puis je la ferme sans la fusionner et je supprime la branche.

## 6. Tests / preuves
- Exécution verte de la CI sur la PR (je donne les liens des exécutions et les durées réelles).
- `actionlint` passe localement (image déjà présente sur votre machine) avant le push.
- Test du script d'épinglage (cas positif et négatif).
- Preuve AC3 (§5.3). Si le merge n'est pas bloqué, je le dis et je corrige avant de considérer l'issue terminée.

## 7. Risques
- **Dépendance à des services externes** dans `docker` (Docker Hub, image RustFS `latest`) : un échec peut venir d'un service tiers, pas du code. Mitigation : relance manuelle possible ; si le job est instable, je le sors des checks requis (il reste exécuté) et je l'indique.
- **Limites de pull Docker Hub** anonymes sur les runners : faible risque à notre volume.
- **Coût** : dépôt public ⇒ minutes GitHub Actions gratuites.
- **Fork PR** : exécutées sans secrets ; sans impact aujourd'hui (aucun secret).
- **Fichier de workflow** : toute modification passe par PR ; un workflow malveillant ne peut pas lire de secrets non existants, mais le principe « actions épinglées + permissions minimales » est posé dès maintenant.

## 8. Questions pour G2
1. **INF-05 dans la même PR ?** Reco : non, PR séparée (taille).
2. **`docker` parmi les checks requis ?** Reco : oui (c'est la preuve d'AC15/AC16), à retirer si instable.
3. **Branche à jour exigée** avant merge (« require branches up to date ») ? Reco : oui ; léger surcoût en rebase pour un développeur seul.
