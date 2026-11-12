# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.
Use GitHub's private vulnerability reporting: the **Security** tab of this repository, then **Report a vulnerability**.

Please include: what is affected, how to reproduce it, and the impact you see. Indicative response: acknowledgement within 7 days.

## Supported versions

The project is in development and has no released version yet. Only the `main` branch is maintained.

## Scope notes

- This repository is public. It must never contain secrets or real data; the credentials in `docker-compose.yml` and `.env.example` are fake, for local development only.
- Security design: see `docs/07-menaces-securite.md` and `docs/08-conformite.md`.
