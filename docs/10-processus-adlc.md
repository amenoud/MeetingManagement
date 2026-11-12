# 10 – Processus ADLC (Agentic Development Life Cycle)

Principe : **l'agent propose et exécute, l'humain décide aux gates.** Rien n'avance sans artefact écrit dans le dépôt.

## 1. Cycle d'une fonctionnalité

```mermaid
flowchart LR
    A[Idée / backlog] --> B[Spec<br/>docs/specs/SPEC-nnn]
    B --> G1{{G1 Validation de la spec}}
    G1 --> C[Issue(s) + DoR]
    C --> D[Plan d'implémentation<br/>mode plan de Claude Code]
    D --> G2{{G2 Validation du plan}}
    G2 --> E[Branche + code + tests<br/>commits conventionnels]
    E --> F[PR + CI verte + auto-revue]
    F --> G3{{G3 Revue de la PR}}
    G3 --> H[Merge squash → staging]
    H --> I[Recette sur staging]
    I --> G4{{G4 Mise en production}}
    G4 --> J[Release + changelog]
    J --> K[Rétrospective]
    K --> A
```

## 2. Les 4 gates humaines

| Gate | Qui décide | Entrée | Critères de passage | Sortie |
|---|---|---|---|---|
| **G1 Spec** | Vous | `docs/specs/SPEC-nnn.md` rédigée par l'agent | User stories claires ; critères d'acceptation **testables** (Given/When/Then) ; rôles et droits listés ; impacts isolation/sécurité/audit/i18n ; hors-périmètre explicite ; questions ouvertes closes | Label `gate:spec-ok`, issues créées |
| **G2 Plan** | Vous | Plan produit en mode plan (fichiers touchés, migrations, tests, risques, découpage en PR) | Cohérent avec ADR et modules ; chaque PR < 400 lignes ; tests prévus pour chaque critère ; aucun changement d'architecture caché | Label `gate:plan-ok` |
| **G3 PR** | Vous | PR avec CI verte + auto-revue | Checklist du template cochée ; diff relu ; tests significatifs (pas de tests creux) ; aucune dérive de périmètre | Merge (squash) |
| **G4 Production** | Vous | Version en staging, recette faite, changelog | Recette sur critères d'acceptation ; sauvegarde fraîche ; plan de rollback ; approbation de l'environnement `production` | Déploiement |

## 3. Definition of Ready (DoR) d'une issue
- [ ] Spec validée (G1) et liée
- [ ] User story et critères d'acceptation Given/When/Then
- [ ] Taille S/M/L (**L = à découper**) ; une seule PR possible
- [ ] Rôles/permissions concernés identifiés (matrice `04`)
- [ ] Impact données : tables, RLS, migration, audit
- [ ] Impact i18n (clés à créer) et notifications
- [ ] Dépendances et ordre connus ; pas de question ouverte

## 4. Definition of Done (DoD) d'une PR
- [ ] Tous les critères d'acceptation couverts par des tests automatisés (nommés d'après la spec)
- [ ] CI verte : lint, types stricts, unitaires, intégration, **isolation tenant**, **authz**, e2e, sécurité
- [ ] Couverture ≥ 80 % sur la logique métier modifiée ; pas de test désactivé
- [ ] Nouvelle table ⇒ RLS + test d'isolation ; nouvelle route ⇒ test de refus par rôle
- [ ] Événements d'audit pour toute action sensible ; aucun secret ni donnée réelle
- [ ] Textes en FR, DE et EN
- [ ] Docs à jour : spec (statut), CLAUDE.md si règle nouvelle, ADR si choix structurant, glossaire si terme nouveau
- [ ] Revue G3 faite ; Conventional Commit de squash ; issue fermée ; changelog alimenté

## 5. Garde-fous automatiques (rappel)
ESLint + Prettier ; TypeScript `strict` (+ `noUncheckedIndexedAccess`) ; Vitest ; Playwright ; suite d'isolation ; matrice de droits ; `dependency-cruiser` ; `commitlint` ; CodeQL/Semgrep ; gitleaks ; audit des dépendances ; SBOM. **Aucun merge sans checks verts** ; l'agent n'a jamais le droit de contourner un check ni de modifier la protection de branche.

## 6. Contexte persistant pour l'agent
- `CLAUDE.md` (règles impératives, < 200 lignes) ; `docs/02-glossaire.md` ; `docs/adr/` ; `docs/specs/` ; `docs/04-roles-permissions.md`.
- **Mise à jour à chaque PR** : si la PR crée une règle, un terme ou un choix, elle modifie le document correspondant (case de la DoD).
- Sous-agents conseillés dans `.claude/agents/` : `spec-writer` (rédige les specs), `reviewer` (revue sécurité/isolation), `test-writer` (cas limites). Commandes `/spec`, `/plan`, `/review` dans `.claude/commands/`.

## 7. Traçabilité de bout en bout
`SPEC-nnn` → issue `#n` (lien spec) → branche `feat/n-slug` → commits `feat(module): … Refs #n` → PR `Closes #n` → release (release-please) → `CHANGELOG.md`. Chaque critère d'acceptation porte un identifiant (`SPEC-012-AC3`) repris dans le nom du test (`it('SPEC-012-AC3 …')`), ce qui permet un rapport de couverture spec ↔ tests (`pnpm spec:coverage`).

## 8. Boucle d'amélioration
À la fin de chaque incrément : rétrospective de 30 min dans `docs/retro/inc-n.md` : ce qui a bien marché, ce qui a coûté du temps, erreurs récurrentes de l'agent, **règles à ajouter/retirer dans CLAUDE.md**, mesures (lead time par issue, taux de PR rejetées en G3, défauts échappés). Actions de la rétro = issues de l'incrément suivant.

## 9. Règles de collaboration avec l'agent
1. L'agent ne démarre jamais l'implémentation sans G1 et G2 validés.
2. Une session = une issue. Contexte frais pour chaque issue (`/clear`) ; le dépôt est la mémoire.
3. L'agent travaille sur une branche, ne pousse jamais sur `main`, ne fusionne jamais, ne déploie jamais en production.
4. L'agent signale toute ambiguïté dans la spec au lieu de deviner.
5. Tout écart de périmètre devient une nouvelle issue.
