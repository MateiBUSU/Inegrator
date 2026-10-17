# Project instructions

## Context
Web platform for high-school computer science (grades IX–XII), built for a hackathon.
Teachers create classes and generate materials with AI (lessons, tests, problems, exercises),
edit them, and publish them to their own class. Students join a class with a code, study, and take tests.
Two separate sections: `programa` (C++ and Python) and `bac` (C++ only).

## Stack (do not change without a serious technical reason)
- npm workspaces monorepo: `apps/web` (React + Vite + TS), `apps/api` (Node + Express + TS), `packages/shared` (types + zod schemas).
- PostgreSQL (local for development, hosting for deployment decided later), accessed through Prisma, versioned migrations.
- AI: Gemini behind a `ContentGenerator` interface. A `MockGenerator` implementation also exists.
- Do NOT use Next.js. Do NOT execute code submitted by students.

## Workflow
- Inspect the relevant code before editing. Follow existing project conventions.
- Keep changes small and focused on the task. Preserve the user's uncommitted changes.
- Do not overwrite files without a reason. Do not delete code you did not create.
- Run the relevant tests/lint after changes, then inspect `git diff`.
- Never claim tests passed unless you ran them in this session. Report the exact command and result.
- Separate "verified" from "unverified" in every report.
- At the end of each stage, give a short summary: what you did, what you verified, what remains.

## Safety
- Do not commit, push, deploy, or run destructive commands (rm -rf, git reset --hard, dropping data) without explicit authorization. A prompt that explicitly asks for a commit counts as authorization for that commit only.

## Backend architecture
- Layers: `routes` (HTTP) → `services` (business logic) → `repositories` (Prisma). Routes never touch Prisma directly.
- zod validation on every body, query, and param. Shared schemas live in `packages/shared`.
- Centralized error handling, format `{ error: { code, message } }`. No stack traces in responses.
- Authentication: httpOnly cookie with JWT, passwords hashed with argon2 or bcrypt.
- Resource-level authorization: always check ownership (teacher-class, student-enrollment).

## Security and minors
- Keys and secrets only in environment variables. Never log them or send them to the frontend.
- Minimize data: no full names, no birth dates. Use a `display_name` field.
- Never send student data to Gemini. Only topic, level, and objectives.
- Rate limiting on login and on generation. Daily generation quota per teacher.
- Students never receive `correct` or `referenceSolution` before submitting a test.
- Scores are computed only in the backend, deterministically, from the answer key confirmed by the teacher.

## AI content
- Every AI response passes zod validation before saving. A published material is immutable; editing creates a new version.
- Publishing is blocked until every correct answer is confirmed by the teacher.
- If the AI is unavailable or the quota is reached, the app stays functional with the saved content.

## Conventions
- TypeScript strict. No unjustified `any`.
- File names `kebab-case`, types `PascalCase`, variables `camelCase`.
- User-facing text in Romanian. Code, short comments, and commit messages in English.

## Commands
- `npm run dev` starts web and api
- `npm run typecheck`, `npm run lint`, `npm test`
- `npm run db:migrate`, `npm run db:seed` (after stage 2)

## Delegation (advisory)
- Do ordinary implementation yourself in the main session (it is configured as Sonnet).
- Use the quick-investigator agent only for narrow, read-only lookups that would otherwise flood the context.
- Use the code-reviewer agent after substantial changes (many files or risky logic).
- Consult the architecture-advisor agent (Opus) only for persistent bugs, cross-module problems, or architecture decisions. Do not spawn agents for trivial tasks.