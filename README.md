# Salty

Salty is a web AI chat application with Supabase Auth, client-side encrypted storage, Drizzle schema management, and Cloudflare Pages Functions for model calls.

## Stack

- React, Vite, TypeScript
- Supabase Auth and Supabase Postgres
- Drizzle ORM and Drizzle Kit
- Cloudflare Pages plus Pages Functions
- OpenAI and DeepSeek BYOK model calls

## Environment

Copy `.env.example` to `.env.local` and fill the Supabase values:

```bash
cp .env.example .env.local
```

Vite reads `.env.local` automatically. Drizzle is also configured to read
`.env.local`, then fall back to `.env`.

If local OpenAI requests return `Unable to reach OpenAI API. fetch failed`,
your local Node runtime cannot directly reach `api.openai.com`. Use either:

```bash
HTTPS_PROXY=http://127.0.0.1:7890
```

or set an OpenAI-compatible gateway:

```bash
OPENAI_BASE_URL=https://your-gateway.example.com/v1
```

For local Cloudflare Pages Functions, also copy `.dev.vars.example` to `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

Do not put Supabase service-role keys or provider API keys in browser-exposed variables. Provider API keys are entered by the user at runtime, encrypted in the browser, and stored in Supabase only as ciphertext.

## Development

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Database

1. Fill `DATABASE_URL` with Supabase's pooled Postgres connection string.
2. Generate migrations:

```bash
npm run db:generate
```

3. Apply migrations:

```bash
npm run db:migrate
```

4. Run `db/rls.sql` in Supabase SQL editor after tables exist.

`db/rls.sql` also creates the private `encrypted-attachments` Supabase Storage bucket and policies for encrypted file blobs. The application uploads only encrypted attachment bytes to this bucket.

## Encryption Model

Supabase Auth handles login/logout. The browser derives the user's vault key from authenticated user information, then decrypts the wrapped app data key locally. Chat titles, message parts, provider API keys, attachment names, MIME types, metadata, and file keys are encrypted before persistence.

Messages are stored as structured encrypted parts in `message_parts` instead of a single plaintext-shaped content field. Attachments use a separate random file key:

1. The browser encrypts the file bytes with the file key.
2. The encrypted blob is uploaded to Supabase Storage.
3. The file key is encrypted with the conversation key and stored in `attachments`.
4. The message references the attachment by encrypted message part data.

The Cloudflare `/api/chat` function sees plaintext only during the live request because it must send prompts and the user-supplied provider key to OpenAI or DeepSeek. It does not persist or log plaintext.
