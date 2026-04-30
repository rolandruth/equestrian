# Changelog

All notable changes to **Directory Master** are documented in this file.

---

## [1.0.0] — 2026-04-30

Initial public release. Full-stack, self-hosted white-label directory website builder.

---

### Architecture

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 (strict) |
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui |
| Backend | Express 5 + Drizzle ORM |
| Database | PostgreSQL |
| Validation | Zod v4 + drizzle-zod |
| API contract | OpenAPI 3.1 → Orval codegen (React Query hooks + Zod schemas) |
| Build | esbuild (ESM bundle) |
| AI | Gemini AI via Replit AI Integrations |

---

### Features

#### Setup Wizard
- Multi-step first-run wizard at `/setup`
- Collects site title, admin email/password, and optional branding
- Sets `installed = true` in `directory_settings` on completion
- All routes redirect to `/setup` until installation is complete

#### Authentication & Authorization
- Session-based auth: Bearer tokens stored in `localStorage`, validated against the `sessions` DB table
- Sessions have a 30-day expiry with DB-backed persistence (survives server restarts)
- Three roles: `admin`, `editor`, `viewer`
  - `admin` — full access including destructive operations
  - `editor` — create/update/delete entries and categories; run imports
  - `viewer` — read-only admin access
- Passwords hashed with `crypto.scryptSync` (salt:hash format)
- Middleware: `requireAuth`, `requireEditor`, `requireAdmin`

#### Public Directory
- Homepage (`/`) — configurable hero, featured entries, category grid, recent listings
- Browse page (`/browse`, `/browse/:category`) — filterable, searchable, paginated listing (Zillow-style cards)
- Entry detail page (`/entry/:id`) — full entry with sidebar showing contact, location, venue, dates, tags
- Sort options: newest (default), oldest, A–Z, Z–A
- All public routes read only `published = true` entries

#### Admin Dashboard
| Page | Path | Notes |
|---|---|---|
| Dashboard | `/admin` | Stats: total entries, categories, published count, drafts |
| Entries | `/admin/entries` | Paginated table with search, status filter, inline publish toggle, edit/delete per row, **Clear All** action |
| Categories | `/admin/categories` | Create, rename, delete categories |
| Import | `/admin/import` | 3-step CSV import wizard (see below) |
| Settings | `/admin/settings` | Site title, logo, hero text, theme colour, custom callout JSON |
| Users | `/admin/users` | Invite users, assign roles, deactivate accounts |

#### CSV Import Wizard (3-step)
Located at `/admin/import`.

**Step 1 — Upload**
- Drag-and-drop or click-to-browse file upload; also supports paste-CSV textarea
- Detects row count from the first parsed line

**Step 2 — Map Columns**
- Calls `POST /api/import/analyze` with CSV headers + up to 3 sample rows
- Server returns heuristic suggestions (regex-based pattern matching, no AI needed at this stage)
- Admin sees a table with: Import toggle (enable/skip), column name, sample values, field dropdown, confidence dot
- Confidence dots: green ≥ 0.85, yellow ≥ 0.60, gray < 0.60
- Location sub-fields (`location_city`, `location_state`, `location_country`) are automatically combined into the `location` field at import time
- At least one column must map to `title` before proceeding

**Step 3 — Progress**
- Calls `POST /api/import/csv` with full CSV content + confirmed `fieldMappings[]`
- Background job: direct field-to-field mapping from confirmed mappings
- Gemini AI enrichment runs **only** when `summary` or `tags` are not mapped — generates them in batches of 20 rows (`gemini-3-flash-preview`, `maxOutputTokens: 16384`)
- Creates missing categories automatically (slug-ified from category name)
- Real-time progress polling via `GET /api/import/status/:jobId` (2-second interval)
- Shows spinner → progress bar → success/error state

#### Entry Fields
All entries support the following fields:

| Field | DB Column | Notes |
|---|---|---|
| Title | `title` | Required |
| Category | `category` | Free-text; auto-creates category on import |
| Summary | `summary` | 1-2 sentence teaser; AI-generated if not mapped |
| Description | `description` | Full rich text |
| Contact Email | `contact_email` | |
| Contact Phone | `contact_phone` | |
| Website | `website` | |
| Location | `location` | Combined from city/state/country sub-fields on import |
| Venue | `venue` | Added in v1.0 for event-style directories |
| Event Type | `event_type` | Conference, Expo, Summit, etc. |
| Start Date | `start_date` | Free-text (e.g. `2026-03-15`) |
| End Date | `end_date` | Free-text |
| Tags | `tags` | Comma-separated; AI-generated if not mapped |
| More Details | `more_details` | Additional plain text |
| Custom Fields | `custom_fields` | JSONB — stores unmapped/overflow columns |
| Published | `published` | Boolean; togglable from entries table |

#### Clear All Entries
- "Clear All" button on `/admin/entries` (red-outlined, admin-only)
- Opens a confirmation modal that requires typing `DELETE` before the action button activates
- Deletes all entries **and** all categories in a single transaction
- Protected by `requireAdmin` middleware on `DELETE /api/entries`
- Success toast shows the exact count of removed entries

---

### API Reference

All routes are under `/api`. Authentication uses `Authorization: Bearer <token>` header.

#### Setup
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/setup/status` | Public | Returns `{ installed: boolean }` |
| `POST` | `/setup/complete` | Public | Complete first-run setup |

#### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Returns session token |
| `POST` | `/auth/logout` | Any | Invalidates session |
| `GET` | `/auth/me` | Any | Returns current user |

#### Entries
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/entries` | Auth | List with pagination, search, category, published filter |
| `POST` | `/entries` | Editor | Create entry |
| `GET` | `/entries/:id` | Auth | Get single entry |
| `PATCH` | `/entries/:id` | Editor | Update entry |
| `DELETE` | `/entries/:id` | Editor | Delete single entry |
| `PATCH` | `/entries/:id/publish` | Editor | Toggle published flag |
| `DELETE` | `/entries` | **Admin** | Wipe all entries and categories |

#### Import
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/import/analyze` | Editor | Analyze headers → suggested `fieldMappings[]` + `availableFields[]` |
| `POST` | `/import/csv` | Editor | Start background import job with confirmed `fieldMappings[]` |
| `GET` | `/import/status/:jobId` | Editor | Poll job status |

#### Public (no auth)
| Method | Path | Description |
|---|---|---|
| `GET` | `/public/entries` | Paginated public listing (published only) |
| `GET` | `/public/entries/:id` | Single public entry |
| `GET` | `/public/stats` | Category + entry counts |
| `GET` | `/public/featured` | Featured entries |
| `GET` | `/public/recent` | Recently added entries |
| `GET` | `/public/settings` | Public-safe site settings |

---

### Database Schema

```
directory_settings   id, site_title, logo_url, hero_title, hero_subtitle,
                     primary_color, installed, custom_callouts (jsonb),
                     created_at, updated_at

users                id, email, password_hash, role, name,
                     created_at, updated_at

sessions             id, user_id (→ users), token, expires_at,
                     created_at

categories           id, name, slug, description,
                     created_at, updated_at

entries              id, title, category, summary, description,
                     contact_email, contact_phone, website, location,
                     venue, event_type, start_date, end_date,
                     tags, more_details, custom_fields (jsonb),
                     source_csv_row, published,
                     created_at, updated_at

import_jobs          id, job_id (uuid), status, message, progress,
                     total_rows, processed_rows, entries_created,
                     categories_created, error,
                     created_at, updated_at
```

---

### Known Limitations & Notes for Developers

- **Gemini model**: `gemini-3-flash-preview`. Batch size for enrichment is 20 rows with `maxOutputTokens: 16384`. Do not increase batch size without also increasing the token limit.
- **API client null guard**: The Orval-generated `getListEntriesUrl` converts `null` parameters to the string `"null"`. Always pass `undefined` (not `null`) for unset optional params in React Query hooks. Server-side null guards exist on `search` and `category` params.
- **express.json limit**: Set to 50 MB in `app.ts` to handle large CSV pastes.
- **Codegen**: Run `pnpm --filter @workspace/api-spec run codegen` after any change to `lib/api-spec/openapi.yaml`. Pre-existing typecheck warnings in the codegen step are non-blocking. Do NOT add `export * from "./generated/types"` to `lib/api-zod/src/index.ts` — causes duplicate export errors.
- **DB migrations**: Use `pnpm --filter @workspace/db run push` for schema changes in development. Never change primary key column types.
- **Sessions**: Stored in the `sessions` table (not in-memory). 30-day expiry. Token is in `localStorage` under the key `"token"`.
- **Clear All requires admin**: The `DELETE /api/entries` route is guarded by `requireAdmin`, not just `requireEditor`. Editors cannot clear all entries.
- **Import field mapping**: `location_city`, `location_state`, `location_country` are virtual fields — they exist only in the mapping UI and are combined server-side into `location` before DB insert. They are not columns in the `entries` table.
