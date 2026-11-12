# ADR-0003 – Authentification : login/mot de passe + TOTP

- Statut : proposé
- Date : 2026-11-12

## Contexte
FAIT : login + mot de passe uniquement, pas de SSO. HYPOTHÈSE H9 : MFA TOTP conservé. Contrainte : pas de service d'identité hébergé hors UE/CH.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Implémentation maison minimale** : Argon2id, sessions en base, TOTP (`otplib`), jetons d'invitation/réinitialisation à usage unique | Maîtrise totale, aucune dépendance de service, adaptée RLS et multi-organisations | Sécurité à soigner (tests ASVS) |
| B. Bibliothèque (Better Auth / Auth.js) | Moins de code | Modèle de session pas toujours aligné avec multi-tenant ; dépendance au rythme du projet ; à valider par un spike |
| C. Service externe (Keycloak auto-hébergé, Zitadel) | SSO prêt | 2ᵉ conteneur, contraire à H11 |

## Décision
**Option A** (spike de 0,5 jour en incrément 1 pour confirmer ; bascule vers B si le gain est net).

- Mots de passe : Argon2id (paramètres OWASP), longueur ≥ 12, vérification contre liste de mots de passe compromis hors ligne (liste locale), pas de règles de composition arbitraires.
- Sessions : identifiant opaque aléatoire 256 bits, stocké **haché** en base, cookie `__Host-` `HttpOnly; Secure; SameSite=Lax`, expiration glissante (idle 8 h, absolue 30 j), révocation, liste des sessions actives.
- MFA TOTP : secret chiffré au repos, codes de secours hachés, obligatoire pour `org_admin`, `chair`, `secretary` (paramètre tenant, défaut activé), ré-authentification exigée pour approuver un PV.
- Anti-force brute : limitation par compte et par IP, délai progressif, aucune différence de message « compte inconnu » / « mot de passe faux », temps de réponse constant.
- Invitations / réinitialisation : jeton aléatoire 256 bits, haché, usage unique, expiration 7 j / 1 h.
- Multi-organisations : le tenant courant est sélectionné après login, porté par la session (`active_tenant_id`) et revalidé à chaque requête contre `membership`.
- CSRF : jeton anti-CSRF ou en-tête d'origine vérifié sur toute mutation.

## Conséquences
Pas de SSO au MVP ; le modèle `user` + `membership` permet d'ajouter OIDC par tenant plus tard sans refonte.
