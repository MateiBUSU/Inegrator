# Progress - Stage 11

## 11a - Teacher view of per-student objective progress (DONE, d182021)
GET /api/materials/:id/objective-progress (teacher, owner only, one row set per enrolled student, never aggregated) + ObjectiveProgressPanel on the published-material page. Tests: api ownership and per-student rows, panel component.

## 11b - Request teacher help (DONE, eeeee45)
objective_progress.help_requested_at (migration 20261018120000). POST /api/objectives/:id/practice/request-help: student only, 409 PRACTICE_NOT_CAPPED unless capped, idempotent (first timestamp kept). Practice UI button wired ("Profesorul a fost anunțat."); teacher panel shows a red "Cere ajutor" badge per student/objective. Resolve: chose NO explicit resolve action for now (flag stays visible) to keep scope small; add a "seen" action later.

## 11c - Single-topic GET (DONE, 133b124)
GET /api/me/topics/:id (student, owner only, 404 otherwise, same body as unknown id). Detail page now calls api.topics.getTopic instead of searching the list.

## 11d - Cleanup (DONE, c22c4ad)
Added apps/api/prisma/cleanup-test-data.ts (npm run db:cleanup-test-data -w @app/api [-- --apply]; dry run by default, localhost DB only). Applied: deleted 14 synthetic users (8 @walk.test, 6 E2E @example.com t17*/s17*/o17*), 9 materials, 5 classes, plus their attempts/progress/enrollments. Kept the 4 @digi.* accounts (look like the team's own). Vite: manualChunks (markdown / react / app): main chunk 606 kB -> 236 kB, no size warning. Working tree has no committed .env (only .env.example with a placeholder); no hardcoded real credentials found (test fakes only in vitest.config.ts / env.test.ts).
