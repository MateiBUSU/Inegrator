# Progress - Stage 11

## 11a - Teacher view of per-student objective progress (DONE, d182021)
GET /api/materials/:id/objective-progress (teacher, owner only, one row set per enrolled student, never aggregated) + ObjectiveProgressPanel on the published-material page. Tests: api ownership and per-student rows, panel component.

## 11b - Request teacher help (DONE, eeeee45)
objective_progress.help_requested_at (migration 20261018120000). POST /api/objectives/:id/practice/request-help: student only, 409 PRACTICE_NOT_CAPPED unless capped, idempotent (first timestamp kept). Practice UI button wired ("Profesorul a fost anunțat."); teacher panel shows a red "Cere ajutor" badge per student/objective. Resolve: chose NO explicit resolve action for now (flag stays visible) to keep scope small; add a "seen" action later.

## 11c - Single-topic GET (DONE, 133b124)
GET /api/me/topics/:id (student, owner only, 404 otherwise, same body as unknown id). Detail page now calls api.topics.getTopic instead of searching the list.

## 11d - Cleanup (DONE, c22c4ad)
Added apps/api/prisma/cleanup-test-data.ts (npm run db:cleanup-test-data -w @app/api [-- --apply]; dry run by default, localhost DB only). Applied: deleted 14 synthetic users (8 @walk.test, 6 E2E @example.com t17*/s17*/o17*), 9 materials, 5 classes, plus their attempts/progress/enrollments. Kept the 4 @digi.* accounts (look like the team's own). Vite: manualChunks (markdown / react / app): main chunk 606 kB -> 236 kB, no size warning. Working tree has no committed .env (only .env.example with a placeholder); no hardcoded real credentials found (test fakes only in vitest.config.ts / env.test.ts).

## 11e - Automated visual smoke pass (DONE, 7f5c3f4)
Playwright: only playwright-core was installable here (no pre-installed browsers found); drove the system Chrome headless against the real dev stack (API + Vite, mock AI). Throwaway script, NOT committed (lives in the session scratchpad); its accounts use @smoke.test, which db:cleanup-test-data catches (already cleaned: 10 users).
Flow covered end to end, with 23 screenshots and console/page-error capture: teacher registers, creates class, generates a test with AI, confirms all answers, publishes, assigns; student registers, joins, opens material, sees objective badges, practices (wrong -> explanation -> Continuă -> correct -> "Stăpânit", badge updates), second objective capped after 6 wrong answers -> "Cere ajutor profesorului" -> "Profesorul a fost anunțat."; personal space: create topic, tutor chat, generate quiz + lesson, take the quiz and see the score; teacher panel shows Stăpânit and the red "Cere ajutor" for that student; mobile (390px) topics page has no horizontal overflow.
Bugs found and fixed: (1) concurrent practice/start for a new student -> 500 (unique index race, hit by React StrictMode double effect) -> createMany skipDuplicates + test; (2) missing favicon -> 404 on every load -> inline SVG favicon.
Known, left as is: console shows 401 on GET /auth/me for logged-out visitors (by design) and 404 on GET .../practice/progress for objectives not started yet (Stage 10a contract); a 10 POST/min AI burst limiter can return 429 to a student answering faster than ~6 s per exercise (UI shows the Romanian message and keeps the answer).
