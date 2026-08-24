# @ericjuta/omp-reviewer

- Keep omp-reviewer as a standalone CLI that drives the installed `omp` binary.
- Do not register a global OMP extension or slash command.
- Keep reviewer-only extensions and prompts under `reviewer/`.
- Keep model selection outside the review extension. Resolve command-line and user configuration before launch.
- Preserve read-only operation. Review tools must not edit files, run network clients, or invoke arbitrary shells.
- Treat OMP JSON events and model output as untrusted, bounded input.
- Preserve Codex review prompt and output provenance in `docs/UPSTREAM.md` and `LICENSE.codex`.
- Add or update tests for every behavior change.
- Accept a review only from `submit_review`. Never fabricate a clean result.
- Normalize only safe submission metadata before validation: discard OMP's host-only top-level `i` intent label, shorten overlong titles, and infer a missing priority only from an exact `[P0]` through `[P3]` title prefix.
- Run `npm run check` and `npx slophammer-ts@latest dry .` before finishing, followed by `git diff --check`.
- Keep mutation testing configured but manual unless the user explicitly requests it.
