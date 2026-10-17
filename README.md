# Informatica IX–XII

Web platform for high-school computer science (grades IX–XII). See `CLAUDE.md` for project rules.

## Requirements

Node.js 20+ (tested on 24) and npm 10+.

## Install

```bash
npm install
cp apps/api/.env.example apps/api/.env
```

## Run

```bash
npm run dev        # web on http://localhost:5173, api on http://localhost:3001
```

## Database

Needs a local PostgreSQL database; set `DATABASE_URL` in `apps/api/.env` (the database must already exist).

```bash
npm run db:migrate -w @app/api   # apply migrations (prisma migrate dev)
npm run db:seed -w @app/api      # idempotent, provisional curriculum
npm run db:check -w @app/api     # row counts
```

## Auth

`apps/api/.env` also needs `JWT_SECRET` (32+ chars) and `TEACHER_SECRET` (8+ chars, teachers must send it as `teacher_secret` to register). See `.env.example`.

Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. The session is a JWT in an httpOnly cookie named `token`.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Layout

- `apps/web` – React + Vite + TypeScript
- `apps/api` – Express + TypeScript (`routes` → `services` → `repositories`)
- `packages/shared` – shared types and zod schemas
