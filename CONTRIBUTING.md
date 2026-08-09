# Contributing to Animer

Thanks for improving Animer. This guide covers a reproducible local setup, the checks expected for changes, and the parts of the codebase that need extra care.

## Prerequisites

- Node.js 20 or newer (the project uses Next.js 16)
- npm
- A Supabase project with pgvector
- A Groq API key for LLM reranking
- A MyAnimeList API client for OAuth and dashboard work
- Optional: Python 3.10+ or Google Colab for rebuilding the embedding indexes

## Set up the app

```bash
git clone https://github.com/taichizzz/AnimeREcommender.git
cd AnimeREcommender
npm install
```

Create `.env.local` in the repository root:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
GROQ_API_KEY=your-groq-key
MAL_CLIENT_ID=your-mal-client-id
MAL_CLIENT_SECRET=your-mal-client-secret
```

Never prefix the service-role key with `NEXT_PUBLIC_`, expose it to client code, paste it into an issue, or commit `.env.local`.

In MAL's API settings, register this local redirect URI:

```text
http://localhost:3000/api/auth/callback
```

Prepare Supabase and populate the embeddings by following [ml/README.md](ml/README.md). The web app needs the synopsis index; the CF index is strongly recommended for the intended hybrid behavior. Run the feedback schema if you are testing reactions.

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`. Use `GET /api/health` for a lightweight process check; it does not validate external dependencies.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/app` | Pages, global styles, and App Router API handlers. |
| `src/components` | Onboarding, quiz, loading, and decorative UI components. |
| `src/lib` | Supabase retrieval, Groq prompts, and external API clients. |
| `ml` | SQL schemas, index-building scripts, and model-training notebooks. |
| `scripts/eval.mjs` | Live recommendation-quality integration harness. |
| `API_REFERENCE.md` | Current internal HTTP contracts. |
| `ARCHITECTURE.md` | Runtime, data flow, fallbacks, and extension points. |

## Development workflow

1. Create a focused branch from `main`.
2. Make the smallest coherent change and keep server secrets in route handlers or server libraries.
3. Update documentation when a route payload, environment variable, model, schema, setup step, or limitation changes.
4. Run the checks appropriate to the change.
5. Open a pull request that explains the user-visible behavior, implementation, and verification.

### Required checks

For every code change:

```bash
npm run lint
npm run build
```

For retrieval, filters, model selection, or prompt changes, start the app in another terminal and run:

```bash
npm run eval
```

The eval uses real configured services and writes the latest run to `scripts/eval-results.json`. It exits non-zero when a profile fails. Review individual rows as well as the aggregate summary.

Only replace the committed baseline when the change is intentional and the new output has been reviewed:

```bash
npm run eval -- --save-baseline
```

To target another deployment:

```bash
npm run eval -- --url https://your-preview.example
```

### Manual checks by area

| Area | Minimum manual verification |
| --- | --- |
| Manual recommendations | Search, add/remove seeds, complete the quiz, inspect ten results, toggle each feedback state. |
| MAL integration | Login, callback, dashboard load, list-based seeds, recommendation exclusions, logout. |
| Retrieval or filters | Test one CF-covered profile, one recent-title profile, and every changed dislike label. |
| LLM prompts | Check ordering, `thinking`, anime-specific reasons, valid JSON handling, and fallback behavior. |
| Dashboard | Test an account with sparse and populated statistics at desktop and mobile widths. |

## Coding guidelines

### TypeScript and Next.js

- Keep TypeScript strict and model external payloads with the smallest useful types.
- Keep credentials, database access, and upstream API calls server-side.
- Validate untrusted request JSON at route boundaries and return consistent status codes.
- Preserve graceful degradation: one retrieval engine may be empty, and Groq may fail.
- Avoid adding client state when a derived value or server result is sufficient.

### Styling and accessibility

- The UI uses Tailwind CSS v4 plus shared tokens and animations in `src/app/globals.css`.
- Reuse the existing color variables and interaction patterns.
- Preserve keyboard access, visible focus behavior, useful labels, reduced-motion behavior, and mobile layouts.

### Retrieval and prompts

- Keep the CF and synopsis score spaces separate; combine ranked results rather than comparing raw cosine scores.
- If you add a dislike-to-genre mapping, update both the v2 route and the eval harness.
- Treat franchise filtering as a safety constraint and run the franchise profiles after heuristic changes.
- Prompts must request machine-parseable JSON and code must continue to validate it.
- Do not log credentials or MAL tokens. Be aware that existing prompt logs may contain user-entered preference text.

### Database and ML changes

- Keep SQL changes idempotent where practical (`if not exists`, `create or replace`).
- Document schema execution order and any migration needed by existing deployments.
- Keep vector dimensions synchronized across schema, notebooks, upload scripts, and `src/lib/supabase.ts`.
- Do not commit generated embeddings, Kaggle credentials, virtual environments, or local dataset files.

## Updating documentation

Use the code as the source of truth. In particular:

- Update [API_REFERENCE.md](API_REFERENCE.md) when request fields, response envelopes, cookies, redirects, or errors change.
- Update [ARCHITECTURE.md](ARCHITECTURE.md) when data flow, external dependencies, fallbacks, or ownership moves.
- Update [README.md](README.md) when installation, product behavior, features, or public entry points change.
- Update [ml/README.md](ml/README.md) when schemas, providers, vector sizes, or notebook order changes.

Examples should be copy-pasteable, use placeholder secrets, and distinguish MAL IDs from AniList IDs.

## Pull request checklist

- [ ] The change is focused and its user impact is described.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Relevant manual flows were exercised.
- [ ] `npm run eval` was run for recommendation changes, or the reason it could not run is recorded.
- [ ] API, architecture, setup, and ML documentation were updated where relevant.
- [ ] No credentials, generated datasets, or unrelated working-tree changes are included.

## Reporting problems

Include reproduction steps, expected and actual behavior, browser/runtime details, and sanitized logs. For recommendation-quality reports, include seed MAL IDs, quiz selections, `engineUsed`, and titles returned. Never include API keys, OAuth tokens, Supabase service-role credentials, or `.env.local` contents.
