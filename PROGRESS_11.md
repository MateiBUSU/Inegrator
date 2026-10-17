# Progress - Stage 11

## 11a - Teacher view of per-student objective progress (DONE, d182021)
GET /api/materials/:id/objective-progress (teacher, owner only, one row set per enrolled student, never aggregated) + ObjectiveProgressPanel on the published-material page. Tests: api ownership and per-student rows, panel component.
