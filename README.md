# @api18n/cli

Command-line interface for the [api18n](https://www.api18n.com) translation
manager. Pull translation keys from the dashboard
([https://www.api18n.com](https://www.api18n.com)) to local JSON files, and
push edits back as reviewable proposals.

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

`api18n login` walks you through generating a Personal Access Token at
**Dashboard → Settings → API Keys**
([https://www.api18n.com/dashboard/settings/api-keys](https://www.api18n.com/dashboard/settings/api-keys))
and saves it for future commands.

For CI, set `API18N_TOKEN` in the environment instead — no `login` needed.

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
| `api18n push` | Submit local changes as a proposal for dashboard approval ([https://www.api18n.com/dashboard/translation](https://www.api18n.com/dashboard/translation)) |
| `api18n push -m "..."` | Attach a summary to the proposal |
| `api18n push --dry-run` | Show the diff without submitting |
| `api18n status` | Show pending proposals and local-vs-server drift |
| `api18n proposals list` | List recent proposals |
| `api18n proposals show <id>` | Print a single proposal's full diff |

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
