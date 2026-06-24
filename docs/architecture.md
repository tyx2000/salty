# Salty Architecture

Salty is a browser-first AI chat app. Supabase Auth proves identity; encrypted data keys prove access to private content. The database stores ownership metadata and ciphertext only.

## Runtime

- Frontend: React, Vite, TypeScript.
- Hosting: Cloudflare Pages with Pages Functions under `functions/api`.
- Auth: Supabase Auth from the browser.
- Database: Supabase Postgres.
- ORM: Drizzle for schema and migrations.
- Providers: OpenAI and DeepSeek through a single `/api/chat` proxy.

## Encryption Boundary

The browser owns all durable secrets:

1. The user logs in with Supabase Auth.
2. The user enters a separate data password.
3. The browser derives a key-encryption key with PBKDF2-SHA-256.
4. The browser unwraps the random user master key.
5. The browser encrypts messages, titles, metadata, and provider API keys before persistence.

The Cloudflare API sees plaintext only for the current model request, because it must send the prompt and BYOK provider key to OpenAI or DeepSeek. It must not log or persist plaintext prompts, completions, or API keys.

## Database Leak Assumption

If Supabase Postgres is exfiltrated, attackers get:

- Supabase Auth identifiers.
- Ciphertexts, nonces, salts, and KDF parameters.
- Non-sensitive routing metadata such as `provider`, `status`, and timestamps.

They should not get:

- Chat content.
- Conversation titles.
- API keys.
- File names or attachment metadata.

This guarantee depends on strong user data passwords, correct nonce handling, strict CSP, and no plaintext logging.
