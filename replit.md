# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Gemini AI (via Replit AI Integrations) for CSV data structuring
- **Auth**: Session-based (in-memory sessions + Bearer tokens)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Directory Master (`/`)
A self-hosted, white-label directory website builder. Users install it via a setup wizard, upload a CSV, and Gemini AI structures the data into categories, entries, and summaries.

**Key features:**
- Setup wizard (multi-step, first-time install)
- Gemini-powered CSV import with progress tracking
- Public directory: homepage, browse/category pages, entry detail pages
- Admin dashboard: manage entries, categories, users, settings, CSV re-import
- Role-based access (admin, editor, viewer)

**Pages:**
- `/` — Public homepage (or setup wizard redirect if not installed)
- `/setup` — Installation wizard
- `/browse` — Category browse page
- `/entry/:id` — Individual entry detail
- `/admin` — Admin dashboard
- `/admin/login` — Admin login
- `/admin/entries` — Manage entries
- `/admin/categories` — Manage categories
- `/admin/import` — CSV import with Gemini
- `/admin/settings` — Directory settings
- `/admin/users` — User management

## DB Schema

- `directory_settings` — Site title, logo, homepage content, theme, installed flag
- `users` — Admin/editor/viewer accounts with hashed passwords
- `categories` — Directory categories with slugs
- `entries` — Directory entries (title, summary, description, contact, location, tags, etc.)
- `import_jobs` — CSV import job tracking

## API Routes

All routes under `/api`:
- `GET /setup/status` — Check if app is installed
- `POST /setup/complete` — Complete initial setup
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /entries`, `GET/PATCH/DELETE /entries/:id`, `PATCH /entries/:id/publish`
- `GET/POST /categories`, `PATCH/DELETE /categories/:id`
- `GET/PATCH /settings`
- `GET/POST /users`, `PATCH/DELETE /users/:id`
- `POST /import/csv`, `GET /import/status/:jobId`
- `GET /public/entries`, `GET /public/entries/:id`, `GET /public/stats`
- `GET /public/featured`, `GET /public/recent`, `GET /public/settings`
