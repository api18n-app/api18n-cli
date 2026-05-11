# @api18n/cli

Command-line interface for the [api18n](https://www.api18n.com) translation
manager. Pull translation keys from the dashboard down to local JSON files.

> **Status**: **M1 / read-only.** Push back as proposals (with dashboard
> approval) lands in M2.

## Install

```bash
npm install --save-dev @api18n/cli
# or
bun add -d @api18n/cli
```

## Setup

```bash
npx api18n init           # creates api18n.config.ts
npx api18n login          # paste a Personal Access Token from the dashboard
npx api18n pull           # writes messages/{locale}.json
```

## Configuration

`api18n.config.ts` at the root of your repo:

```ts
import { defineConfig } from '@api18n/cli';

export default defineConfig({
  // Path pattern with {locale} placeholder. Default: messages/{locale}.json
  locales: 'messages/{locale}.json',

  // Optional — only pull/push these locales. Defaults to all enabled
  // on the dashboard.
  // include: ['en', 'pt', 'fr'],

  // Optional — override the dashboard URL.
  // baseUrl: 'https://www.api18n.com',

  // Required if your account belongs to more than one company.
  // companyId: process.env.API18N_COMPANY_ID,
});
```

## Authentication

Generate a Personal Access Token at **Dashboard → Settings → API Keys**.
Tokens look like `a18n_live_…` and are stored at
`~/.api18n/credentials.json` with `0600` permissions.

Override per-command with `--token`, or set `API18N_TOKEN` in the
environment for CI.

## Commands

| Command | What it does |
|---|---|
| `api18n init` | Create `api18n.config.ts` |
| `api18n login` | Store a Personal Access Token |
| `api18n logout` | Delete the stored token |
| `api18n whoami` | Print the signed-in user / company / host |
| `api18n pull` | Fetch translations and write local files |
| `api18n pull --dry-run` | Show what would change without writing |
| `api18n pull --locale en pt` | Only pull specific locales |

## File format

Pulled files are JSON, one per locale, nested by dot-segments of the key:

```json
// messages/en.json
{
  "button": {
    "cancel": "Cancel",
    "save": "Save"
  },
  "createCompany": {
    "metadata": {
      "title": "Create company"
    }
  }
}
```

This matches the conventions used by `next-intl`, `i18next`, and most
JavaScript i18n libraries. Empty (`null`) translations are omitted from
the output so missing keys don't show up as JSON `null`s.

## Development

```bash
bun install
bun run build
node bin/api18n.mjs --help
```
