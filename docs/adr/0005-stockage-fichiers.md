# ADR-0005 – Stockage de fichiers

- Statut : proposé
- Date : 2026-11-12

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Stockage objet S3-compatible UE/CH** (fourni par le PaaS ou par un acteur UE) | Standard, scalable, chiffrement au repos, sauvegardes/versioning du bucket | 1 service de plus (mais managé) |
| B. Fichiers en base (`bytea`/large objects) | 1 seul service | Gonfle la base et les sauvegardes, performances |
| C. Disque du conteneur | Trivial | Éphémère sur PaaS ; inacceptable |

## Décision
Option A. Un seul bucket privé, clés `tenants/{tenant_id}/documents/{document_id}/{version_no}` et `tenants/{tenant_id}/minutes/{minutes_id}/v{n}.pdf`.

- Aucun accès public ; téléchargement via l'application qui vérifie le droit puis délivre une **URL signée de 60 secondes** (ou diffuse en flux).
- Téléversement : vérification serveur du type MIME (signature de fichier, pas l'extension), liste blanche (PDF, DOCX, XLSX, PPTX, PNG, JPEG, TXT), taille max 25 Mo, nom de fichier jamais utilisé comme chemin, SHA-256 calculé et stocké.
- Antivirus : hors MVP (risque accepté, noté dans le modèle de menaces) ; prévu en V2 (ClamAV en service séparé ou analyse par le fournisseur).
- Versioning du bucket activé si le fournisseur le permet, pour récupération des suppressions accidentelles.
- Fichiers jamais servis « inline » depuis le domaine principal (en-tête `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`) ; prévisualisation PDF via visionneuse sandboxée.

## Conséquences
Export tenant et suppression de tenant itèrent sur le préfixe `tenants/{tenant_id}/`.
