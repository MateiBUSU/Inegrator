# Progress - Stage 11

## 11a - Teacher view of per-student objective progress (DONE, d182021)
GET /api/materials/:id/objective-progress (teacher, owner only, one row set per enrolled student, never aggregated) + ObjectiveProgressPanel on the published-material page. Tests: api ownership and per-student rows, panel component.

## 11b - Request teacher help (DONE, eeeee45)
objective_progress.help_requested_at (migration 20261018120000). POST /api/objectives/:id/practice/request-help: student only, 409 PRACTICE_NOT_CAPPED unless capped, idempotent (first timestamp kept). Practice UI button wired ("Profesorul a fost anunțat."); teacher panel shows a red "Cere ajutor" badge per student/objective. Resolve: chose NO explicit resolve action for now (flag stays visible) to keep scope small; add a "seen" action later.

## 11c - Single-topic GET (DONE, 133b124)
GET /api/me/topics/:id (student, owner only, 404 otherwise, same body as unknown id). Detail page now calls api.topics.getTopic instead of searching the list.
