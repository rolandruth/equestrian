# Changelog

All notable changes to **Directory Master** are documented in this file.

---

## [2.2.0] — 2026-05-02

Mobile admin navigation, public nav session awareness, and admin Dashboard shortcut.

---

### New Features

#### Mobile Admin Navigation (Hamburger Menu)
- On screens narrower than `md` breakpoint, the desktop sidebar in `AdminLayout` is hidden and replaced with a sticky top bar showing the site title and a hamburger (☰) icon on the right.
- Tapping the hamburger slides in a full-height drawer from the left edge (width 272 px, `z-50`) with all nav links: Dashboard, Entries, Categories, Import CSV, SEO, Users, Settings, View Site, and Log out.
- A semi-transparent dark overlay (`bg-black/50`, `z-40`) sits behind the drawer; tapping it closes the drawer.
- An X button inside the drawer header provides an explicit close action.
- Tapping any nav link closes the drawer automatically via an `onNavigate` callback.
- Drawer open/close is animated with a CSS `transition-transform duration-300 ease-in-out` (`translateX`). Desktop sidebar layout is unchanged.

#### Public Nav Session Awareness (Sign In / Sign Out)
- The public header now reads the auth token from `useAuth` to determine login state.
- When **not logged in**: "Sign In" link navigates to `/admin/login` (existing behaviour).
- When **logged in**: "Sign In" is replaced with a "Sign Out" button that calls `POST /api/auth/logout`, then clears the local token via `clearToken()`.
- Both the desktop nav bar and the mobile hamburger menu reflect this state.

#### Admin Dashboard Shortcut in Public Nav
- When the logged-in user has `role === "admin"`, a **Dashboard** link (with `LayoutDashboard` icon) appears in the public nav between "Browse All" and "Sign Out".
- Non-admin roles (editor, viewer) do not see this link.
- The link appears in both desktop nav and mobile menu.
- Implemented by calling `useGetCurrentUser` with `{ query: { enabled: isLoggedIn } }` so the API call is skipped entirely when no session token is present.

---

### Developer Notes for v2.2

- **`AdminLayout` mobile drawer**: State is managed with `useState(false)` inside the component — no global state or context required. The `NavLinks` sub-component accepts an optional `onNavigate` prop so the same JSX is shared between desktop sidebar and mobile drawer.
- **`PublicLayout` auth state**: `isLoggedIn = Boolean(token)` from `useAuth`. Role check: `isAdmin = isLoggedIn && currentUser?.role === "admin"`. Both are derived values, not stored in state. The `useGetCurrentUser` query is conditionally disabled when `isLoggedIn` is false to prevent unnecessary 401 requests.
- **Sign Out from public nav**: Calls `logoutMutation.mutateAsync(undefined)` first (invalidates the server session), then `clearToken()` regardless of whether the mutation succeeds, so the UI never gets stuck in a signed-in state if the server is unreachable.
- **Dashboard link visibility**: Intentionally restricted to `admin` role. Editors and viewers can still reach `/admin` directly — the link just isn't surfaced on the public site for them.

---

## [2.1.0] — 2026-05-02

Featured entries, AI-assisted column mapping, and custom field rendering.

---

### New Features

#### Featured Entries
- Added `featured` boolean column to the `entries` table (default `false`).
- `PATCH /api/entries/:id/featured` — toggles featured status, protected by `requireEditor`.
- `GET /public/featured` — public endpoint already existed; now backed by real DB data from the `featured` flag.
- Star icon button in the admin entries table: filled gold star = featured, outline = not featured. Button color uses the site's primary theme color.
- Virtual **"Featured"** row on the Categories screen shows a live count of currently featured entries. Not a real category — for visual reference only.

#### "Map With Gemini" AI Column Mapping
- New **"Map With Gemini"** button on the Map Your Columns import step (Step 2).
- Calls `POST /api/import/ai-map` with the CSV headers and up to 3 sample rows per column.
- Gemini (`gemini-3-flash-preview`) reads column names + sample data and returns one mapping per column: either a standard field name (e.g. `title`, `location`, `contactPhone`) or the literal string `"custom"` for domain-specific columns it cannot match to a standard field.
- Server-side post-processing converts `"custom"` → `custom_<slugify(csvColumnName)>` and sets `customLabel = original CSV column name` — Gemini never invents arbitrary slugs.
- Guarantees exactly one `category` mapping is assigned; falls back to the first non-title, non-skip column if Gemini omits it.
- AI-mapped rows are highlighted in amber with a sparkle (✦) icon. Each row shows an inline description of what the field stores.
- `customFieldDefs` array is returned alongside `mappings` and registered as selectable options in the field dropdown for subsequent manual adjustments.

#### Custom Fields on Entry Detail Page
- `entry.tsx` now renders every key in `customFields` JSONB as its own visible section below the main description.
- Section heading is derived from the custom field key: hyphens and underscores are replaced with spaces, then title-cased (e.g. `accepted-dental-insurance-providers` → "Accepted Dental Insurance Providers").
- Content is rendered `whitespace-pre-wrap` to preserve multi-line values.
- Sections are only shown when the field has a non-empty value.

---

### Developer Notes for v2.1

- **`custom_*` key convention**: Custom field keys in the `customFields` JSONB column always follow the pattern `custom_<slug>` at the mapping stage, then are stored without the `custom_` prefix (e.g. key `accepted-dental-insurance-providers`). The slugifier uses hyphens (`-`), not underscores — the entry detail page now handles both with `/[-_]/g` replacement.
- **Gemini prompt contract**: The AI map prompt explicitly forbids Gemini from inventing slugs. The only valid values for `targetField` are a standard field string (from `AVAILABLE_FIELDS`), `"custom"`, or `"skip"`. All slug generation is done deterministically server-side using `slugify(csvColumn)`.
- **`customLabel` field**: Returned in each mapping object. For custom fields it holds the exact original CSV column header string. For standard and skipped fields it is `null`. The frontend uses this value as the display label in the amber custom-field rows.
- **`PATCH /api/entries/:id/featured`**: Accepts `{ featured: boolean }` body. Returns the updated entry. Guarded by `requireEditor`.
- **Featured count on Categories page**: The "Featured" virtual row is computed client-side from `entries` data already loaded on the page — no extra API call.

---

## [2.0.0] — 2026-05-01

Visual Page Builder release. Introduces a full Elementor-like drag-and-drop builder for all three public pages, WYSIWYG rich text editing, per-section typography and color controls, and end-to-end live preview — builder changes are reflected on public pages immediately after save.

---

### New Features

#### Visual Page Builder (`/admin/builder/:page`)
- Full-screen 3-column layout: block library (left), drag-and-drop canvas (center), properties panel (right)
- Supports three pages: `homepage`, `browse`, `entry` — launched from Settings → Visual Page Builder
- Drag-and-drop section reordering via `@dnd-kit/sortable` (8px pointer activation threshold)
- Per-section enable/disable toggle (eye icon) and delete (trash icon)
- **Gear / Edit button** on every section card — always visible, turns blue when that section is selected — makes it immediately clear which section is being edited
- Auto-save: 1.5-second debounce after any change; shows "Auto-saving…" → "Saved & live" status in the top bar
- Manual "Save Now" button for immediate persistence
- "Preview" button opens the live public page in a new tab

#### Block Types
| Block | Page | Description |
|---|---|---|
| Hero Banner | Homepage | Full-width hero with optional background image, overlay, CTA button |
| Category Grid | Homepage | Clickable category cards; configurable column count and max items |
| Featured Entries | Homepage | Grid of featured/pinned entries |
| Recent Entries | Homepage | Most recently added entries |
| Text Block | Homepage | Custom heading + WYSIWYG body text paragraph |
| Image Block | Homepage | Full-width image with optional caption |
| Page Header | Browse | Title and result count |
| Search & Filters | Browse | Sidebar search and category filter panel |
| Entry Cards Grid | Browse | Main paginated grid |
| Title & Summary | Entry | Entry title, category badge, and summary |
| Description | Entry | Full description body |
| Additional Info | Entry | Extended details section |
| Details Sidebar | Entry | Contact info and metadata side panel |
| Related Entries | Entry | Grid of similar entries in the same category |

#### Per-Section Properties Panel
Every section exposes the following controls (where applicable):

**Typography**
- Font Family — Inter, Poppins, Roboto, Georgia, Playfair Display, Montserrat (per section override)
- Heading Size — S (18px) / M (24px) / L (30px) / XL (36px) / 2XL (48px)
- Heading Color — color swatch + hex input
- Body / Subtitle Size — S (14px) / M (16px) / L (18px) / XL (20px)

**Background**
- Background Color — color swatch + hex input with clear (×)
- Background Image URL — text input; enables overlay slider
- Overlay Opacity — 0–100 slider (shown only when background image is set)

**Text / CTA**
- Text Color, Text Alignment (Left / Center / Right)
- Padding — Small / Medium / Large
- Button Text, Button URL, Button Color

**WYSIWYG Editor** (Text Block only)
- Tiptap-based inline editor with formatting toolbar
- Bold, Italic, Underline; H2, H3, Paragraph; Bullet list, Numbered list
- Alignment: Left / Center / Right
- Text color picker (Tiptap Color extension)
- Output stored as HTML in `richBodyText` prop field

#### `templateSettings` Schema (`SectionConfig`)
Stored as JSONB in `directory_settings.template_settings`. Structure:

```typescript
interface TemplateSettings {
  homepage: { font: string; heroImageUrl: string; sections: SectionConfig[] };
  browse:   { font: string; heroImageUrl: string; cardFields: string[]; sections: SectionConfig[] };
  entry:    { font: string; sidebarFields: string[]; sections: SectionConfig[] };
}

interface SectionConfig {
  id: string;           // unique block id (e.g. "hero", "custom-text-<timestamp>")
  type?: string;        // block type (falls back to id if absent)
  label: string;
  enabled: boolean;
  heading?: string;
  props?: SectionProps;
}

interface SectionProps {
  backgroundColor?: string; backgroundImage?: string;
  textColor?: string; headingColor?: string;
  textAlignment?: "left" | "center" | "right";
  padding?: "sm" | "md" | "lg"; overlayOpacity?: number;
  buttonText?: string; buttonUrl?: string; buttonColor?: string;
  fontFamily?: string; headingFontSize?: string; bodyFontSize?: string;
  bodyText?: string; richBodyText?: string;   // richBodyText is HTML from Tiptap
  imageUrl?: string; imageCaption?: string;
  maxItems?: number; columns?: number;
  sidebarTitle?: string;
}
```

#### Public Page Rendering (WYSIWYG → Live)
`home.tsx`, `browse.tsx`, and `entry.tsx` were fully rewritten to consume `SectionConfig.props` directly:

- **`home.tsx`**: Section order and visibility driven by `templateSettings.homepage.sections`. Each section type (`hero`, `categories`, `featured`, `recent`, `custom-text`, `custom-image`) reads all props (background, colors, fonts, sizes, buttons) and applies them as inline styles. Custom text blocks render `richBodyText` via `dangerouslySetInnerHTML`.
- **`browse.tsx`**: Header banner background/color/heading driven by `header` section props; `heroImageUrl` flat field removed.
- **`entry.tsx`**: Header background color, heading color/size, body font/size, and sidebar background/heading color all driven by their respective section props. Sidebar title reads from `props.sidebarTitle`.

**Auto-save pipeline:**
1. User edits any property in the builder
2. `updateBlocks()` → `scheduleAutoSave()` — 1.5s debounce starts
3. `PATCH /api/settings` with full `templateSettings` object
4. `qc.invalidateQueries(getGetPublicSettingsQueryKey())` fires
5. Public pages re-fetch and re-render with new styles — no page reload needed

---

### Developer Notes for v2.0

- **`templateSettings` not in OpenAPI spec**: The `PATCH /api/settings` body accepts `templateSettings` as a passthrough field in `settings.ts`. The frontend casts `{ templateSettings: current } as any` when calling `updateMutation.mutateAsync`. If you add `templateSettings` to the OpenAPI spec, remove the `as any` cast and regenerate with `pnpm --filter @workspace/api-spec run codegen`.
- **Tiptap imports**: `TextStyle` must be imported as a named export — `import { TextStyle } from "@tiptap/extension-text-style"`. There is no default export. `setContent()` no longer accepts a boolean second argument in newer Tiptap — pass no second argument or use `{ emitUpdate: false }`.
- **Builder route**: `/admin/builder/:page` is wrapped in `RequireAuth` only (no `AdminLayout`). It is full-screen and manages its own header bar.
- **`mergeTemplateSettings`**: Always use this function when reading `templateSettings` from the API — it fills in missing sections and fields with defaults so the public pages never crash on partial data. New default sections are appended to the end of any stored array.
- **Custom block IDs**: Non-unique block types (Text Block, Image Block) use `${type}-${Date.now()}` as their ID so multiple instances can coexist. Standard blocks (hero, categories, etc.) use their type string as the ID and enforce single-instance by skipping the add if the ID already exists.
- **Font loading**: The `FontLoader` component injects a `<link>` tag into `<head>` for Google Fonts at the page level. Individual section font overrides use inline `fontFamily` style — no additional font loading at section level. If you add new fonts, update `FONTS` in `templateTypes.ts` and ensure `getFontGoogleUrl` returns the correct URL.
- **Vite cache**: If Tiptap or other new dependencies produce "does not provide an export named 'default'" errors after install, delete `artifacts/directory-master/node_modules/.vite` and restart the workflow to force re-optimization.

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
