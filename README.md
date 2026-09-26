# Ask Nemi

A resume you talk to instead of read. Ask Nemi answers questions about Nehemiah
("Nemi"), in Indonesian or English, from a knowledge base he curates himself, and says so
honestly when the answer is not in it.

**Live:** https://web-portofolio-rag.vercel.app · the same backend also powers the chat inside
[ICEBERG](https://nemiiceberg.vercel.app)

## How an answer is made

1. **Embed the question** with Gemini `gemini-embedding-001` (768 dimensions).
2. **Retrieve.** The `match_chunks` RPC in Supabase runs a hybrid search (pgvector similarity
   plus keyword search). Every knowledge base chunk is stored with three synthetic questions,
   and a hit on a synthetic question is swapped back to its parent chunk
   (`src/lib/match-chunks.ts`). When the question names a project, that project's best chunk
   is pinned into the context, and a "list all projects" question pins the project index, so
   an English question about an Indonesian page cannot lose the project it named.
3. **Gate.** Chunks below a similarity floor are dropped. If even the best match is weak,
   the prompt tells the model to fall back honestly instead of answering from off-topic text
   (`src/app/api/chat/route.ts`).
4. **Answer.** Gemini 2.5 Flash, with fallback models when the free quota runs out, streamed
   to the browser as Server-Sent Events. A leak guard drops any internal note the model
   echoes at the start of an answer and replaces em dashes (`src/lib/leak-guard.ts`).

The persona and answering rules live in `prompts/chatbot-instructions.md` and are compiled
into `src/lib/chatbot-instructions.ts` by `npx tsx scripts/gen-system-prompt.ts`.

## Guard rails

- **Burst limit** per client, in memory (`src/lib/rate-limit.ts`).
- **Daily cap** per IP, stored in Supabase so it survives cold starts
  (`src/lib/daily-limit.ts`, schema in `supabase/rate-limit.sql`).
- **Payload limits** on message count and length before any model call.
- **No provider errors leak** to visitors: quota and auth failures are reported by kind only.
- **Keep-alive.** Supabase's free tier pauses after about a week without traffic, so
  `/api/keep-alive` is hit daily by a Vercel cron (`vercel.json`), with a GitHub Actions
  backup (`.github/workflows/keep-alive.yml`).

## Knowledge base

The knowledge base is a folder of Markdown files kept outside this repo. `scripts/ingest.ts`
chunks each file by heading, embeds every chunk, generates and embeds three synthetic
questions per chunk, and replaces that file's rows in the `chunks` table. Files whose name
starts with `_`, or with `exclude_from_rag: true` in their frontmatter, are skipped.

```bash
npm run ingest                                   # whole knowledge base
npx tsx scripts/ingest.ts --only projects/a.md   # only the files that changed
```

The `chunks` table and the `match_chunks` function live in the Supabase project. Only the
rate limit schema is versioned here.

## Evaluation

`evals/questions.json` is a small golden set. `scripts/run-evals.ts` records the retrieved
sources and similarities for each question, calls the local `/api/chat` end to end, and writes
a report to `evals/results/`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Gemini API · Supabase
(Postgres + pgvector) · Vercel

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in the Supabase and Gemini keys
npm run dev
```

`GET /api/chat/test` checks that Gemini and Supabase are reachable.
