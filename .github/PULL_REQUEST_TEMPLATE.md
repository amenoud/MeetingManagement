## Quoi / pourquoi

Closes # · Spec : docs/specs/SPEC-___.md · ADR (si applicable) :

## Changements

-

## Preuves

- [ ] Critères d'acceptation de la spec couverts par des tests (lesquels) :
- [ ] lint, typecheck, tests unitaires / intégration / e2e verts
- [ ] Tests d'isolation et de droits ajoutés ou mis à jour
- [ ] Captures d'écran (FR/DE/EN si UI)

## Garde-fous (cocher ou justifier)

- [ ] Nouvelle table : `tenant_id` + FK composites + `app.enable_tenant_isolation()` dans la même migration ; `pnpm db:audit` vert
- [ ] **Aucune modification de `db/isolation-exceptions.json`**, ou chaque ajout est justifié ici (raison, issue d'approbation) :
- [ ] Aucun secret, aucune donnée réelle dans le diff
- [ ] Textes UI dans les 3 langues
- [ ] Événements d'audit émis pour les actions sensibles
- [ ] Migration rétrocompatible (expand/contract)
- [ ] CLAUDE.md / docs / ADR mis à jour si une règle ou un choix a changé

## Écarts par rapport au plan

-

## Gate G3 (revue humaine)

- [ ] J'ai relu le diff ligne à ligne
