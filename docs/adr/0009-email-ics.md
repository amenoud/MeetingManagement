# ADR-0009 – E-mail transactionnel et invitations .ics

- Statut : proposé
- Date : 2026-11-12

## Options
| Option | Verdict |
|---|---|
| **SMTP générique** (via `nodemailer`) vers un fournisseur UE/CH (ex. Brevo, Scaleway TEM, Infomaniak) | **Retenue** : fournisseur interchangeable par configuration |
| API propriétaire d'un fournisseur US (SendGrid, Postmark, SES) | Écartée (H7) |
| Serveur SMTP auto-hébergé | Écartée : réputation et délivrabilité à charge |

## Décision
- Domaine d'envoi dédié avec **SPF, DKIM, DMARC** configurés ; adresse `From` fixe, `Reply-To` du secrétaire/organe.
- Les e-mails sont envoyés par jobs (ADR-0004), avec journal de livraison (`outbox_email` : statut, tentatives, identifiant du message).
- **Invitation calendrier** : pièce jointe `text/calendar; method=REQUEST` (iCalendar RFC 5545/5546) avec `UID` stable par séance, `SEQUENCE` incrémenté à chaque modification, `METHOD:CANCEL` pour annulation, `ORGANIZER` = adresse de l'application (le secrétaire en `Reply-To`), `LOCATION` et `URL` selon le mode (physique, en ligne, hybride), fuseau `Europe/Zurich` avec définition `VTIMEZONE`.
- Les RSVP se font **dans l'application** via lien à jeton (pas de traitement des réponses `.ics` par e-mail au MVP).
- Contenu : l'e-mail de convocation contient l'ODJ ; les annexes sont **des liens authentifiés** vers l'application (pas de pièces jointes volumineuses, pas de fuite par transfert d'e-mail).
- Limites : plafond d'envois par tenant et par heure (anti-abus), liste de suppression pour rebonds.
- Tests : rendu de `.ics` vérifié par parseur dans la CI (cas : fuseau, changement d'heure d'été, mise à jour, annulation).
