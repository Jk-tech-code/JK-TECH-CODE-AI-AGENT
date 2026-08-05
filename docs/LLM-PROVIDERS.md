# JK-TECH-CODE AI — Multi-Provider LLM Architecture

This document describes the secure, modular, multi-provider LLM layer that powers
the JK-TECH-CODE AI Brain.

- [Architecture](#architecture)
- [Supported providers](#supported-providers)
- [Environment variables](#environment-variables)
- [Switching providers](#switching-providers)
- [Automatic fallback](#automatic-fallback)
- [How to add a new provider](#how-to-add-a-new-provider)
- [Local development with Ollama](#local-development-with-ollama)
- [Deploying to Vercel](#deploying-to-vercel)
- [Security](#security)
- [Quality assurance](#quality-assurance)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
                        ┌──────────────────────────────┐
                        │           The Brain          │
                        │  (brain.ts pipeline: intent, │
                        │   memory, knowledge, plan,   │
                        │   reasoning, verify, humanize)│
                        └──────────────┬───────────────┘
                                       │ imports ONLY the facade
                                       ▼
                        ┌──────────────────────────────┐
                        │    providers/llm.ts          │  thin facade — keeps the
                        │    (Brain-facing API)        │  exact same exports
                        └──────────────┬───────────────┘
                                       │ delegates
                                       ▼
                        ┌──────────────────────────────┐
                        │     providers/manager.ts     │  Provider Manager
                        │  • active provider (env)     │  • health checks
                        │  • fallback chain            │  • retries + timeouts
                        │  • diagnostics / validation  │  • error handling
                        └──────────────┬───────────────┘
                                       │ routes to one LLMProvider
       ┌──────────┬──────────┬─────────┼─────────┬──────────┬─────────┬─────────┐
       ▼          ▼          ▼         ▼         ▼          ▼         ▼         ▼
   gemini.ts  ollama.ts  openai.ts groq.ts  openrouter.ts together.ts anthropic.ts
   (REST+SSE) (local)    │         │         │            │          (Messages API)
                         └─────────┴─────────┴────────────┘
                                   openai-compat-core.ts
                          (one shared OpenAI-compatible implementation)
```

**Key rules**

- The **Brain never imports a provider implementation**. It talks only to
  `providers/llm.ts`, which delegates to the **Provider Manager**
  (`providers/manager.ts`).
- Every provider implements the same `LLMProvider` interface
  (`providers/interface.ts`):

  ```ts
  interface LLMProvider {
    readonly name: LLMProviderName;
    check(): Promise<ProviderStatus>;                 // availability probe
    complete(messages, options?): Promise<LLMCompleteResult>; // non-streaming
    stream(messages, options?): AsyncGenerator<LLMStreamChunk>; // streaming
    getInfo(): Promise<ProviderModelInfo>;            // model + host metadata
  }
  ```

- Failures never crash the app. Providers throw `ProviderError` with a
  human-friendly message and a `retryable` flag (false = retrying won't help,
  e.g. invalid key; true = transient, e.g. rate limit/outage).

## Supported providers

| Provider key   | Provider                   | Env API key              | Default model                    |
| -------------- | -------------------------- | ------------------------ | -------------------------------- |
| `gemini`       | Google Gemini (default)    | `GEMINI_API_KEY`         | `gemini-2.5-flash`               |
| `ollama`       | Ollama (local)             | *(none — local)*         | `qwen3:4b`                       |
| `openai`       | OpenAI                     | `OPENAI_API_KEY`         | `gpt-4.1`                        |
| `groq`         | Groq                       | `GROQ_API_KEY`           | `llama-3.3-70b-versatile`        |
| `openrouter`   | OpenRouter                 | `OPENROUTER_API_KEY`     | `google/gemini-2.5-flash`        |
| `anthropic`    | Anthropic Claude           | `ANTHROPIC_API_KEY`      | `claude-sonnet-4-20250514`       |
| `together`     | Together AI                | `TOGETHER_API_KEY`       | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |

Every provider supports **streaming** (SSE/NDJSON) with a graceful fallback to
non-streaming where the API requires it. Gemini, OpenAI, Groq, OpenRouter,
Together and Anthropic all support both paths.

## Environment variables

All configuration is read from environment variables — never hardcoded.

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | Active provider key (`gemini` default). |
| `LLM_FALLBACK_ENABLED` | `"true"` / `"1"` to enable automatic fallback. |
| `LLM_FALLBACK_ORDER` | Comma-separated fallback chain (optional). |
| `LLM_TIMEOUT_MS` | Optional overall request timeout safety net (0 disables). |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_RETRIES` | Gemini. |
| `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_MAX_RETRIES` | Ollama (local). |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES` | OpenAI. |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`, `GROQ_TIMEOUT_MS`, `GROQ_MAX_RETRIES` | Groq. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`, `OPENROUTER_MAX_RETRIES` | OpenRouter. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_TIMEOUT_MS`, `ANTHROPIC_MAX_RETRIES` | Anthropic. |
| `TOGETHER_API_KEY`, `TOGETHER_MODEL`, `TOGETHER_BASE_URL`, `TOGETHER_TIMEOUT_MS`, `TOGETHER_MAX_RETRIES` | Together AI. |

Copy `.env.example` to `.env.local` and fill in the keys you want to use.
`.env*` files are git-ignored — never commit them.

## Switching providers

**At the environment level** (applies to everyone, and on Vercel):

```bash
LLM_PROVIDER=groq GROQ_API_KEY=... npm run dev
```

**Per user** (via the AI Settings page, `/settings/ai`): pick the provider,
model, temperature, top P, top K, max tokens, streaming, reasoning level,
memory and automatic fallback. Preferences persist per user in the
`UserPreference` table and are honored on the next message.

## Automatic fallback

When `LLM_FALLBACK_ENABLED=true` (or the user enables the settings toggle), a
request that fails with a **retryable** error (rate limit, timeout, outage,
invalid model) automatically retries on the next provider in the chain:

```
gemini → groq → openrouter → openai → anthropic → together → ollama (local)
```

- The chain starts at the requested/selected provider, then follows the order.
- Only providers with a configured API key are considered (Ollama is always
  eligible locally).
- **Non-retryable** errors (invalid API key) never fall back — they surface
  immediately with a clear message.
- **Streaming**: fallback happens only *before the first chunk* arrives. A
  failure mid-stream is surfaced to the user (switching providers mid-stream
  would corrupt the reply).
- Override the order with `LLM_FALLBACK_ORDER="groq,openrouter,gemini"`.

## How to add a new provider

1. **Create the provider file** in `src/brain/providers/`. If the new provider
   speaks the OpenAI Chat Completions protocol, use the shared core:

   ```ts
   // src/brain/providers/mystery.ts
   import { createOpenAICompatProvider, getCompatConfiguredModel, getCompatHost } from './openai-compat-core';

   export const mysteryProvider = createOpenAICompatProvider('mystery');
   ```

   (Add a `mystery` entry to `CONFIGS` in `openai-compat-core.ts` with the base
   URL, default model and env var prefix — env keys are derived automatically:
   `MYSTERY_API_KEY`, `MYSTERY_MODEL`, `MYSTERY_BASE_URL`.)

   If it has its own API shape, implement `LLMProvider` directly following
   `anthropic.ts` as a template (REST + SSE, retries, timeouts, friendly
   `ProviderError` mapping, secret redaction).

2. **Register it** in `manager.ts`:
   - Add the key to `LLMProviderName` in `interface.ts` and to
     `LLM_PROVIDER_NAMES`.
   - Import the singleton and add it to `PROVIDER_REGISTRY`.
   - Add cases to `getConfiguredModel()` and `getProviderHost()`.

3. **Settings**: add a default model in `envDefaultModel()` (`settings.ts`),
   an entry in `PROVIDER_OPTIONS` and `MODEL_PRESETS` on the settings page.

4. **Docs & env**: add the env vars to `.env.example` and this document.

5. **Tests**: add unit tests in `tests/` following `tests/providers-manager.test.ts`.

## Local development with Ollama

1. Install [Ollama](https://ollama.com) and pull a model:

   ```bash
   ollama pull qwen3:4b
   ```

2. Configure the app:

   ```bash
   LLM_PROVIDER=ollama
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=qwen3:4b
   ```

3. `npm run dev` and chat. If the server is down you get a friendly
   "Local AI is currently unavailable" message with a Retry affordance —
   the app never crashes.

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js).
   Build command `npm run build`; output is `standalone`-ready.
2. In **Project → Settings → Environment Variables**, add the variables for
   the provider(s) you want — e.g. `LLM_PROVIDER=gemini` and
   `GEMINI_API_KEY=<key>`. Add `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
   `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TOGETHER_API_KEY` if you want
   fallback or multi-provider support. Also add the non-LLM vars from
   `.env.example` (DATABASE_URL, SUPABASE, NEXTAUTH_SECRET, etc.).
3. Redeploy. Secrets live only in Vercel — they are never in the codebase or
   the client bundle. Server-only code reads them via `process.env`; nothing
   LLM-related is exposed to the browser.
4. Check the **AI Settings** page — it lists every provider's configured/
   reachable status and surfaces configuration diagnostics.

## Security

- Secrets are read exclusively from `process.env` at call time.
- **Never logged**: providers log status codes and sanitized detail text only;
  `openai-compat-core.ts` redacts anything that looks like a key (`sk-…`,
  `AQ.…`, `Bearer …`) before logging.
- **Never in error messages**: all errors are friendly, human-readable and
  contain no credential material.
- **Never in client bundles**: the provider layer is server-only (imported by
  API routes / server modules). No `NEXT_PUBLIC_*` LLM keys exist.
- **Presence-only diagnostics**: `getEnvDiagnostics()` reports which variables
  are set (booleans), never their values. It feeds the AI Settings page and
  `validateConfig()`.
- **Fail-fast diagnostics**: `validateConfig()` reports an invalid
  `LLM_PROVIDER` or a missing key for the active provider. The app logs a loud
  warning and the settings page shows the errors; a misconfigured provider
  degrades to a friendly message rather than crashing.
- **Rotate exposed keys**: any API key that has ever been pasted into a chat,
  a log, or a repo should be considered compromised — generate a new one and
  update the environment variable.

## Quality assurance

```bash
npx tsc --noEmit        # TypeScript
npm run lint            # ESLint
npm run test            # Vitest (unit + integration)
npm run build           # Production build (Next.js standalone)
npm run health:report   # Startup diagnostics table
```

Coverage (see `tests/`):

- `providers-manager.test.ts` — provider selection, fallback chain, retry /
  fallback behavior, streaming pre-chunk fallback, timeout, diagnostics
  without leaking secrets, settings defaults.
- `providers-openai-compat.test.ts` — OpenAI-compatible core (OpenAI/Groq/
  OpenRouter/Together): config, completions, SSE streaming, error mapping.
- `providers-anthropic.test.ts` — Anthropic completions, SSE streaming,
  thinking blocks, error mapping.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "…API_KEY is not configured" | Add the key to `.env.local` or the Vercel project settings. |
| "could not authenticate" | The key is invalid/expired or the provider needs billing enabled. Rotate the key. |
| "model … is not available" | Check `*_MODEL` (e.g. `GROQ_MODEL`). Model names differ per provider; the settings page lists presets. |
| "rate-limited" | Wait and retry, or enable automatic fallback to fail over to another provider. |
| "Local AI is currently unavailable" | Ollama isn't running — start it (`ollama serve`) or set `LLM_PROVIDER` to a cloud provider. |
| "model … is not installed locally" | `ollama pull <model>`. |
| `LLM_PROVIDER="x" is not a supported provider` | Typo in the env var; the app falls back to `gemini` and logs a warning. |
| Streaming starts then fails | The provider errored mid-stream (can't switch providers mid-stream). Retry the message. |
| Settings page shows a provider as unavailable | Its key is missing (check the environment) or the provider health probe failed. |
