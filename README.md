# RevLog

RevLog is a project memory and immutable hardware & software release ledger for engineering teams. It organizes multi-board and multi-software systems under a 3-level hierarchy (**Projects → Products → Modules → Items**) and records both **Product Releases** and system-wide **Project Releases** backed by SHA-256 file hashes and canonical release manifest hashes.

## Hierarchy & Release Model

- **Projects (`public.projects`)**: Upper system container (e.g., *Industrial Telemetry Platform*) with shared team roles (`owner`, `member`, `viewer` in `public.project_members`).
- **Products (`public.products`)**: Individual hardware PCBs, embedded firmware units, or software components (`hardware`, `software`, `mixed`) belonging to a project (e.g., *Sensor Board `PCB-SNS-01`*, *Gateway Controller `SW-GW-01`*).
- **Modules (`public.categories`) & Items (`public.items`)**: Ordered module buckets inside each product containing immutable SHA-256 files (`project-files` storage bucket) and external links.
- **Dual-Level Immutable Releases**:
  - **Product Releases (`public.releases` + `public.release_items`)**: Cryptographic snapshot of selected items within a single product (`publish_release`).
  - **Project Releases (`public.project_releases` + `public.project_release_products`)**: System-level baseline bundling published releases across multiple products (`publish_project_release`) with its own canonical SHA-256 `manifest_hash`.

## Requirements

- **Node.js**: v20 or newer (tested on Node v24) and **npm**
- **Docker** (Docker Desktop or Engine) and **Supabase CLI** (`npx supabase`) for running the local Supabase stack

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local Supabase stack (applies migrations and development seed data automatically):

   ```bash
   npx supabase start
   ```

3. Copy `.env.example` to `.env` and populate `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the `npx supabase status` output:

   ```bash
   cp .env.example .env
   npx supabase status
   ```

4. Start the Vite development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:5173`.

## Environment Variables

Configure these in `.env` (see `.env.example`):

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | `http://127.0.0.1:54321` | Base URL of your Supabase project or local `supabase start` API |
| `VITE_SUPABASE_ANON_KEY` | Yes | — | Public Supabase `anon` key |
| `VITE_MAX_UPLOAD_MB` | No | `50` | Maximum allowed file upload size in megabytes |

**Security rule**: Only the public `anon` key may be placed in client-exposed `VITE_*` variables. Never expose the `service_role` key to the browser; `src/lib/env.ts` rejects `service_role` JWTs at startup.

## Running Migrations and Seed Data

All database tables, composite foreign-key constraints, immutability triggers, Row Level Security policies, storage bucket policies (`project-files`), and RPC functions (`create_project`, `create_product_with_template`, `create_project_with_template`, `add_project_member_by_email`, `publish_release`, `publish_project_release`) live in `supabase/migrations/`.

- Reset the local database and re-apply all migrations and `supabase/seed.sql` from scratch:

  ```bash
  npx supabase db reset
  ```

- Push migrations to a linked remote Supabase instance (Supabase CLI v3):

  ```bash
  npx supabase db push --remote --yes
  ```

### Development Seed Accounts

`supabase/seed.sql` creates a sample `"Industrial Telemetry Platform"` project with two products (`Sensor Board` and `Gateway Controller`), published product releases, a published `"System 2026.11"` project release, and three demo users (password for all three: `Password1234`):

- `owner@revlog.local` — Project owner
- `member@revlog.local` — Project member
- `viewer@revlog.local` — Read-only viewer

## Testing, Linting and Verification

Run formatting, typechecking, linting, unit/database tests and production build verification:

```bash
npm run format
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run test` runs Vitest suites covering:

- **Canonical manifest hashes** (`src/lib/manifestHash.ts` & `src/lib/releaseHelpers.test.ts`): deterministic `COLLATE "C"` / Unicode code-point sorting and exact parity with PostgreSQL `publish_release()` and `publish_project_release()`.
- **Database immutability & RLS** (`src/test/database.test.ts`): boots an embedded PostgreSQL instance (`@electric-sql/pglite` with `pgcrypto`), runs `supabase/migrations/` and `supabase/seed.sql` from scratch, verifies multi-product templates, product and project release immutability triggers, snapshot isolation after edits, and RLS across `owner`, `member`, `viewer` and non-member accounts.
- **Navigation & design guidelines** (`src/components/navigationConfig.test.ts`, `src/test/guidelines.test.ts`): verifies workspace/project/product route resolution, centralized color tokens, WCAG AA contrast ratios, standardized typography, and neutral English copy.

## Project Structure

```text
/
├─ supabase/
│  ├─ migrations/          # SQL schema, composite FKs, triggers, RPCs, RLS & Storage policies
│  ├─ seed.sql             # Multi-product project, demo users, product & project releases
│  └─ config.toml          # Local Supabase CLI configuration
├─ src/
│  ├─ providers/           # Refine auth, Supabase client/data, access control and i18n providers
│  ├─ theme/tokens.ts      # Centralized Ant Design theme and CSS custom property tokens
│  ├─ i18n/en.json         # English UI copy catalog
│  ├─ lib/                 # Web Crypto SHA-256, canonical manifest hashes, storage & access hooks
│  ├─ pages/
│  │  ├─ auth/             # Sign in and sign up form
│  │  ├─ projects/         # Projects list, project creation, product grid overview and project settings
│  │  ├─ products/         # Product template creation, split module/item workspace and product settings
│  │  ├─ items/            # Side drawer for file uploads (progress + SHA-256) and external links
│  │  ├─ releases/         # Product-level 4-step release wizard, timeline and snapshot detail
│  │  └─ project-releases/ # System-level 4-step project release wizard, timeline and snapshot detail
│  ├─ components/          # App shell layout, declarative sidebar config, badges and module manager
│  ├─ test/                # PGlite PostgreSQL harness, RLS/immutability tests and guideline checks
│  └─ App.tsx              # Refine configuration and route tree
├─ DECISIONS.md            # Log of architectural and implementation decisions
├─ README.md
└─ .env.example
```
