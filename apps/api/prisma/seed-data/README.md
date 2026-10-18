# Seed data

`curriculum.json` is a **PROVISIONAL** curriculum used for development and demos.

It is **NOT verified against the official curriculum** (programa școlară / programa de bacalaureat).
Subjects, chapters, objective codes and wording are placeholders and must be replaced with
verified content before any real use.

Scope: `bac` + C++ (no grade), `programa` + C++ / Python for grades 9 and 10, and `programa` + C++ for
grade 11. Chapters follow the pbinfo.ro curriculum structure (titles only). Each chapter has 2 objectives.

The seed (`npm run db:seed -w @app/api`) is idempotent: it upserts by subject `slug`,
chapter `(subject, position)` and objective `(chapter, code)`.
