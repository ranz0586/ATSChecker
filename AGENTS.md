# Project guide

Align is a local React application that compares a resume with a job description, reports ATS text compatibility, and exports a revised resume. Optional OpenAI or Gemini evaluation adds semantic fit review and a tailored rewrite. Read `README.md` for setup and product limitations.

## KOS Graphify route

Read `D:\Ranz Knowledge OS\AGENTS.md` and `D:\Ranz Knowledge OS\02 - Projects\Active\ATSChecker\PROJECT-CONTEXT.md` for active project work. Resume from `D:\Ranz Knowledge OS\02 - Projects\Active\ATSChecker\handoff.md`. KOS holds project notes and decisions; repository files are the code authority.

Before broad source search for code, architecture, or decisions, run `python "D:\Ranz Knowledge OS\00 - System\Automations\kos_graphify.py" query --project "ATSChecker" --question "<specific question>"`. Verify important graph leads and explicit source references in repository files; stale graphs are unavailable.

After code or Graphify configuration changes, use the same script to run `refresh --project "ATSChecker"`, then separately `status --project "ATSChecker"`. Changed KOS notes are read directly and need no re-index.

After meaningful work, refresh the KOS handoff with current status, blockers, next action, and actual checks. Draft decisions or durable facts await approval before promotion. Keep older detail in linked dated history snapshots; do not create a second notes tree or load history automatically.

Follow the KOS BrewedOps code workflow when relevant: meaningful failing check, implementation, code-structure where needed, scanloop, then local-panel greploop. Report incomplete checks. Local commits for completed code pieces are allowed after checks; pushes, publishing, remote configuration, and deployment require explicit user authorization. Use ship only for a requested deployment. If KOS is inaccessible, follow repository guidance and report the continuity gap.

Never index resumes, job descriptions, credentials, or generated files.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/main.jsx` | React workflow, uploads, reports, editing, and downloads |
| `src/styles.css` | Styling and responsive layouts |
| `shared/analysis.js` | Input validation, keyword matching, missing-skill questions, candidate-statement validation, scoring, and conservative cleanup; shared by browser and server |
| `shared/resume-format.js` | Country suggestions, validated format profiles, English spelling conventions and page-size selection |
| `server/index.js` | Express API, request limits, AI consent, fallback, and app startup |
| `server/files.js` | PDF/DOCX/TXT extraction, archive limits, and DOCX generation |
| `server/ai.js` | Provider configuration, OpenAI Responses/Gemini Chat Completions requests, shared output validation, and error handling |
| `tests/app.test.js` | Node tests for analysis, files, mocked AI, and HTTP flow |
| `vite.config.js` | React build configuration |

The project uses JavaScript ES modules, React, Vite, and Express. There is no database or browser persistence. Development uses Vite middleware inside Express, so only one server process is needed.

## Commands

Requires Node.js 22.13 or newer; Node 24 is recommended. Run commands from the project root.

```sh
npm ci
npm run dev
npm test
npm run build
npm start
```

- Development and production default to `http://localhost:3000`, bound to `127.0.0.1`.
- Run the build before production startup. Stop an existing server before starting another on the same port.
- On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.
- If system npm is broken and the ignored recovery copy exists, use `node .tools/package/bin/npm-cli.js <command>`. Do not make that copy a project dependency.
- Server changes require a restart; frontend changes reload automatically in development.

## Change rules

- Trace the affected flow and callers before editing. Fix shared behavior at its responsible layer.
- Prefer existing helpers, native browser features, Node APIs, and installed dependencies. Keep changes focused; avoid speculative abstractions and unrelated refactoring.
- Reuse `shared/analysis.js` for original and revised scores. Do not duplicate scoring or validation in the UI or API.
- Keep the local review usable without an API key and when the AI service fails.
- Preserve the original resume and current inputs on failed uploads or requests. Invalidate stale reports when source inputs change.
- Keep controls labeled, keyboard navigation functional, status/error messages accessible, and layouts usable on narrow screens.
- Update `README.md` when setup, score interpretation, limits, or user-visible behavior changes.
- Do not edit generated files in `dist/`, installed packages in `node_modules/`, caches, or the npm recovery copy. Update `package-lock.json` with intentional dependency changes.

## Resume and scoring invariants

- Compatibility scores are heuristics, never ATS pass probabilities or hiring guarantees. Do not claim access to a company's private screening rules or visual-layout evaluation from extracted text.
- Current local weights are 65% keyword alignment, 25% text structure, and 10% impact signals. Explicit requirements have double keyword weight. Keep implementation, UI explanations, tests, and README consistent if these change.
- Local cleanup only standardizes recognized headings, bullets, and whitespace. Never insert missing skills, invented metrics, credentials, employers, dates, or accomplishments.
- AI rewriting must preserve supported facts, identify gaps separately, and require users to review the draft. Prompt instructions do not guarantee factual accuracy.
- Candidate-confirmed skill statements are self-reported, not independently verified. Require a stated level, concrete example and explicit confirmation. Preserve knowledge/practice/professional distinctions; keep statements separate from the original resume and never apply them through local cleanup or AI failure fallback.
- Compare original and revised text against the same job description and requirements. Clearly mark scores that have not yet been updated after editing.
- Keep exports selectable, single-column text. Supported inputs are text-based PDF, DOCX, and UTF-8 TXT; scanned PDFs need external OCR.

## Privacy and trust boundaries

- Keep resumes and job descriptions in memory. Do not add document logging, analytics payloads, database storage, or browser persistence as an incidental change.
- Keep `AI_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY` on the server in `.env` or the server environment. Never expose them through browser code, `VITE_` variables, API responses, logs, screenshots, or commits.
- `AI_PROVIDER` selects `openai` or `gemini`; generic key/model settings override provider-specific settings. Preserve existing OpenAI configuration compatibility.
- Require explicit consent naming the selected provider before transmitting documents. Reject stale provider consent; never silently switch providers on failure. Treat document content as untrusted data, not instructions.
- Preserve shared structured AI output validation, timeout handling, and local fallback. Keep `store: false` for OpenAI; do not claim zero provider retention or apply OpenAI's storage flag to Gemini.
- Preserve server-side validation, cross-origin POST rejection, upload signature checks, and parser cleanup.
- Current limits: 5 MB uploads; 80–30,000 characters for resume/job text; 5,000 characters for requirements; 1,000 DOCX entries and 20 MB expanded archive content.
- The current server permits one concurrent AI request. Public hosting requires an intentional deployment change with authentication, quotas, HTTPS, and appropriate upload isolation.
- The README documents the Mammoth CLI dependency advisory. Verify current advisories before dependency updates; do not blindly apply `npm audit fix --force` or downgrade the parser to an obsolete release.

## Verification

- For logic, API, parsing, export, or dependency changes, run `npm test`. Add the smallest meaningful regression check to the existing Node test suite; no additional test framework is needed.
- For frontend or build changes, run `npm run build` and exercise the affected workflow in the browser. Check desktop and narrow layouts when layout changes.
- Use synthetic resumes for tests and screenshots. Mock AI calls; do not send real personal documents or incur live API usage during routine verification.
- Documentation-only changes need a check that referenced paths and commands are accurate; do not run unrelated checks.
- Report what changed, what was verified, and material limitations. Distinguish mocked AI coverage from live provider testing.
