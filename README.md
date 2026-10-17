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
