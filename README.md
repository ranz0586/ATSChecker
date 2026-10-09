# Align — ATS resume checker

A React application for comparing a resume with a job description, reviewing ATS text compatibility, and downloading an improved resume. PDF, DOCX, and UTF-8 TXT uploads are supported, along with pasted text.

## Run

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open http://localhost:3000. The Express server runs the API and Vite development middleware together; only one process is needed.

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. If the machine's npm installation is broken, the workspace-local recovery copy can be used:

```sh
node .tools/package/bin/npm-cli.js run dev
```

The recovery copy is ignored by version control and is not needed on a normal installation.

## Enable AI evaluation and rewriting

Copy `.env.example` to `.env`. Select OpenAI or Gemini and supply a server-side key for that provider:

```env
AI_PROVIDER=gemini
AI_API_KEY=your-gemini-key-here
# Optional model override; omit to use the provider default.
AI_MODEL=gemini-3.8-flash
PORT=3000
```

| `AI_PROVIDER` | Default model | API |
| --- | --- | --- |
| `openai` (default) | `gpt-4o-mini` | OpenAI Responses with [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and `store: false` |
| `gemini` | `gemini-3.8-flash` | Google's [OpenAI-compatible Chat Completions endpoint](https://ai.google.dev/gemini-api/docs/openai#structured-output) with JSON schema output |

To switch, change `AI_PROVIDER` and replace `AI_API_KEY` with a key issued by that provider. Clear `AI_MODEL` to use its default, or set a compatible model available to your account. Restart the server and reload the page. Keys from one provider do not authenticate with the other.

Alternatively, leave `AI_API_KEY` empty and configure `OPENAI_API_KEY` and/or `GEMINI_API_KEY`; `AI_PROVIDER` selects which key is used. Existing `OPENAI_API_KEY`/`OPENAI_MODEL` setups continue to work with no provider specified. `GEMINI_MODEL` is also supported. Generic `AI_API_KEY` and `AI_MODEL` take precedence over provider-specific settings. The app never automatically retries with a different provider.

Gemini model IDs include the gemini- prefix (for example, gemini-3.5-flash-lite). Numeric shorthand such as 3.5-flash-lite is normalized automatically. Gemini requests use low reasoning effort to leave more of the output budget for the review and rewritten resume. Connection failures, timeouts, model rejection, and truncated output produce specific messages; incomplete drafts are never applied.

Enable **Include AI review** before analyzing. The consent text names the selected provider; the API verifies that the consented provider still matches the server configuration. Provider access and applicable billing are required. Keys are never returned to the browser. Both providers share the same rewrite instructions, result validation, and local fallback.

Without a key, the app provides local checks and conservative formatting cleanup. If AI fails, the app returns the local results and displays the error. AI scores are subjective fit estimates, separate from the local compatibility score. AI drafts must be checked for factual accuracy before applying.

## What the score means

- **65% keyword alignment:** literal job terms found in the resume. Explicit requirements have twice the weight of other terms.
- **25% text structure:** contact email, common headings, typical word count, and readable extracted text.
- **10% impact signals:** action verbs and measurable outcomes.

These are transparent heuristics, not a company ATS simulator, pass probability, hiring recommendation, or guarantee. Keyword extraction is primarily English and uses a small skill vocabulary plus frequent terms. Full-sentence requirements may need AI review for semantic interpretation. The app cannot inspect private screening rules, employer knockout questions, or visual layout from extracted text. Scanned PDFs require OCR outside the app. Legacy `.doc` is not supported.

Local cleanup standardizes recognized headings, bullet characters, and whitespace without inserting missing skills or achievements. AI is instructed to preserve factual information, identify unsupported requirements, and avoid inventing qualifications. Users can edit the revision, rerun the local score, and download a single-column DOCX or TXT resume. Original and revised scores use the same job description.

## Country formatting and revised scores

Choose **Job country / resume format** before analyzing. The default suggests a country only when the job description contains exactly one supported country's full name. Multiple countries, abbreviations, city-only locations and unsupported countries fall back to International / other; select the job's actual country manually. A mention may refer to a headquarters rather than the job location, so verify the suggestion. Changing this selection invalidates the previous report.

New Zealand and other A4 profiles export an A4 DOCX; United States and Canada use Letter. AI adapts new prose to the selected English spelling convention and uses unambiguous dates where supported. It preserves names, official titles, phone numbers, currencies and locations rather than guessing nationality, work rights or a telephone country code. Local cleanup does not translate or rewrite prose; without AI, the country setting controls DOCX page size only. TXT exports have no paper size. These are app formatting defaults, not universal employer requirements. Review employer instructions and [New Zealand's CV guidance](https://tahatu.govt.nz/work/applying-for-a-job/how-to-write-a-cv).

**Overview shows the original resume's local score. Refined resume shows the revised score**, its component scores, and remaining suggestions. The provider's fit estimate also evaluates the original resume against the role; rechecking an edited draft updates the local score only. For example, 65% keyword alignment with full structure and impact scores gives an overall score of 77. Formatting alone cannot fix unsupported or absent qualifications. AI is asked to use exact job terminology where existing facts support it, without inventing skills to hit 80–90. Country selection itself adds no score bonus; the 65/25/10 weights are unchanged.

## Privacy and deployment

The app processes uploads and documents in memory and has no database, analytics, document logging, or browser persistence. Documents are lost when the page is refreshed. Optional AI requests send documents only to the selected provider and are subject to that provider's data policies. OpenAI requests use `store: false`; this does not promise zero provider retention. Gemini uses Google's own data policies; OpenAI's storage flag does not apply to its API.

The server binds to `127.0.0.1` for local use, rejects cross-origin POST requests, limits input lengths and upload sizes, and allows one concurrent AI request. DOCX archives are limited to 1,000 entries and 20 MB of expanded content. Before public deployment, add authentication, per-user quotas, HTTPS, upload isolation, and monitoring appropriate to handling personal information. It is deliberately a local application rather than an unauthenticated public AI endpoint.

Dependency audit: npm reports three moderate findings from the `mammoth → argparse → sprintf-js` chain. The [upstream advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) currently lists no patched version. In this installation, Mammoth imports `argparse` only in its command-line program (`bin/mammoth`); this app uses its text-extraction API and never runs that CLI. Keep tracking upstream rather than applying npm's suggested downgrade to an obsolete Mammoth release.

## Vercel deployment

Deploy from the project root with the **Vite** preset, build command `npm run build`, output directory `dist`, and Node 24. `api/index.js` exports the existing Express API; `vercel.json` routes `/api/*` to that function. Deploying only `dist` publishes the frontend without its API and gives `/api/config` a 404. Commit the source changes and redeploy.

In Vercel's server environment settings, set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL=gemini-3.5-flash-lite`. Generic `AI_API_KEY`/`AI_MODEL` take precedence if present. Apply variables to the intended environment and redeploy; local `.env` files are not uploaded. Never use `VITE_` prefixes for secrets.

`/api/config` returns public configuration JSON without exposing API keys. There is no app password or login requirement. Local startup remains unchanged. The Vercel entry trusts one HTTPS proxy hop so existing same-origin POST checks work behind Vercel.

This deployment intentionally permits unauthenticated access for personal use with the user's free Gemini account. Anyone who discovers the URL can make requests and consume the available quota. Provider HTTP 429 responses retain local results. AI attempts are also limited to 10/hour per function instance, including failures; local review remains available after that limit. Instances and restarts have separate counters, so this is not a global limit. Add authentication and persistent per-user quotas before enabling paid access or distributing the app broadly.

The function maximum duration is 120 seconds to accommodate the AI timeout; your plan must support it. Vercel's [request/response payload limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) is 4.5 MB, below the local app's 5 MB upload limit. Use smaller uploads on Vercel; larger files require a separate upload design.

## Verify and run production

```sh
npm test
npm run build
npm start
```

Tests exercise scoring boundaries, truthful cleanup, PDF extraction, DOCX round-tripping, input validation, provider configuration, mocked OpenAI/Gemini requests and failures, provider-specific consent, and the HTTP upload-to-download flow. Live AI evaluation requires a configured account and is not exercised by the automated tests.
