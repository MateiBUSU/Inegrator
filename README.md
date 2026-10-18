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

## AI provider (mock vs Gemini)

`AI_PROVIDER` in `apps/api/.env` picks who writes lessons, quizzes and tutor replies. **If it is unset, the app uses `mock`**: a deterministic, canned generator for tests and offline demos. Its text is generic (it only quotes sentences from uploaded documents), and the UI marks it with a "Conținut de test (mock)" badge.

To test with the real model:

1. Get a Gemini API key and put it in `apps/api/.env` (never commit it):
   `AI_PROVIDER=gemini`, `GEMINI_API_KEY=<key>`, optionally `GEMINI_MODEL=...`.
2. Restart the API. It refuses to start with `AI_PROVIDER=gemini` and no key.
3. Generate a new material: the mock badge is gone when the real provider wrote it. Materials generated earlier keep the provider they were made with.

The Gemini provider is wired but had not been run against the live API when this was written, so check the first real generation by eye. Only topic, level, objectives and teacher-uploaded text are sent to the provider, never student data.

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
