# SPEC.md

Roadmap and feature specification for the Hardware Release Ledger.

The MVP (auth, projects, categories, items, release wizard, release history, release detail, signed downloads) is done. This file lists what comes next, in priority order. Tick a box only when the item meets its acceptance notes and `npm run typecheck`, `npm run lint` and `npm run test` pass.

## Principles

- **Filter for every feature:** does it make a release more trustworthy, or easier to find? If not, it probably belongs in another tool.
- **Deterministic checks.** Hash, BOM/PnP consistency and completeness checks are implemented in plain code. AI may explain or suggest, never decide.
- **Files stay the customer's.** Store files and metadata; do not send customer files to third-party services without an explicit, per-project opt-in.
- **Published releases stay immutable.** No feature may modify a published release or its snapshot.
- **Same design rules as the MVP:** use refine and ant design components, light theme, one accent color, English copy. do not use any other component library. do not change color scheme or theme. do not use any other font family than the default one. do not use any shadcn ui components. do not change theme and keep the current design.
- **Each feature gets its own page and sidebar menu entry** where it has a screen of its own. Keep menu labels short and plain.
- **Migrations only.** Every schema change is a new file in `supabase/migrations/`, with RLS and tests.

---

## Phase 1: Release trust (highest value)

- [x] 1. **BOM/PnP parsing and consistency check**
  - Separate page and sidebar menu entry ("BOM & PnP").
  - Parse BOM and PnP/centroid CSV exports (KiCad and Altium first); let the user map columns when headers are not recognized.
  - Show the parsed data as tables with search and filters.
  - BOM checks: missing MPN, duplicate reference designators, empty value or footprint, DNP entries.
  - BOM vs PnP checks: reference designator present in one but not the other, side mismatch, rotation anomalies.
  - Each finding has a severity (error, warning, info), the affected rows and a plain-English description.
  - A check run is stored per release draft and per published release (stored results are read-only once published).
  - The release wizard "Review" step shows the latest check results and warns, but does not block.
  - Unit tests with sample KiCad and Altium files.

- [ ] 2. **Release comparison**
  - Separate page and menu entry ("Compare").
  - Pick any two published releases of a project.
  - Show added, removed and changed items per category, with changed `sha256` or `url` highlighted.
  - When both releases contain a parsed BOM, show added, removed and changed parts (by reference designator and MPN).
  - Uses `release_items` snapshots only; never live item data.

- [ ] 3. **Release package and manifest**
  - On a published release, "Download package" produces a zip of all files plus `manifest.json` (version, date, publisher, `manifest_hash`, per-file SHA-256 and original path).
  - The manifest hash must equal the stored `manifest_hash`; verify it in a test.
  - Package is built on demand and not stored permanently.

- [ ] 4. **Expiring share link**
  - Owner or member can create a read-only share link for a published release, with an expiry (e.g. 1, 7, 30 days) and the ability to revoke it.
  - The link opens a minimal public page: release summary, file list, downloads. No account needed.
  - Links are random, unguessable tokens; store only a hash of the token.
  - Log the creation and revocation of links.

- [ ] 5. **Completeness checklist**
  - Per-project setting (project settings page): required items for a release, for example "Hardware: BOM, PnP, Gerber; Test: test report".
  - The release wizard "Review" step shows which required items are missing.
  - Default is a warning; the owner can make a rule blocking.

- [ ] 6. **Approval step before publishing**
  - Optional per-project setting: a release needs approval by a second person (a different member or owner) before it can be published.
  - States: draft, in review, approved, published. Record who approved and when.
  - The approver sees a read-only review screen including check results.

---

## Phase 2: Viewers

- [ ] 7. **Gerber viewer**
  - Browser-based layer viewer on the release detail page and item panel (toggle layers, zoom, pan).
  - Use an existing open-source library; do not write a Gerber parser from scratch.
  - Graceful message when a file cannot be parsed.

- [ ] 8. **PnP overlay on the board**
  - Draw PnP component positions and rotations over the Gerber view.
  - Click a component to show its BOM row; click a BOM row to highlight the component.
  - Requires items 1 and 7.

- [ ] 9. **3D viewer**
  - GLB and STL first, using three.js.
  - STEP support only after a separate evaluation of WebAssembly options and bundle size; record the decision in `DECISIONS.md`.

- [ ] 10. **PDF and schematic preview**
  - Inline PDF preview for file items, without downloading.

---

## Phase 3: Release-linked records

- [ ] 11. **Test results**
  - Structured test summary attached to a release: test name, result (pass, fail, skipped), date, tester, optional report file.
  - Release detail shows an aggregate (e.g. 18 passed, 1 failed).
  - Separate page and menu entry ("Tests").

- [ ] 12. **Known issues and change (ECO) log**
  - Separate page and menu entry ("Issues & Changes").
  - Known issue: title, description, severity, affected release(s), status (open, resolved), resolved-in release.
  - Change record: title, reason, affected categories, from-release and to-release.
  - Release detail shows known issues open at the time of publishing.

- [ ] 13. **Production tracking**
  - Separate page and menu entry ("Production").
  - Record production batches: release, quantity, date, manufacturer, serial number range.
  - Lookup: given a serial number, show the batch and the release it was built from.

- [ ] 14. **StrictDoc requirements (read-only first)**
  - A "Requirements" category type that accepts an exported StrictDoc HTML or ReqIF file and renders it read-only on the release detail page.
  - Linking requirements to releases and tests comes later and needs a separate spec.

- [ ] 15. **Open items list**
  - A small list of open tasks attached to a release draft ("before publishing: update BOM").
  - Not a general project management tool; no assignees, boards or sprints.

---

## Phase 4: Integrations

- [ ] 16. **CLI and GitHub Action**
  - A command (`ledger publish`) and a GitHub Action that create a release from CI output: upload files, compute hashes, create the draft and optionally publish.
  - API token management page (create, list, revoke); tokens are scoped to one project.
  - This is the real answer to stale manual uploads.

- [ ] 17. **Cloud storage connectors**
  - Link items to Google Drive and similar storage as link items with optional hash verification. Connectors only read; they never write to the customer's storage.

- [ ] 18. **Webhooks and chat notifications**
  - Webhook on release published; Slack and Teams message templates.
  - Settings page for webhook URLs with a "send test" button.

---

## Phase 5: Part data

Check the terms of service, quotas and pricing of each data provider before building.

- [ ] 19. **Part lookup**
  - Match BOM lines by MPN to a provider API (Nexar/Octopart, DigiKey, Mouser): stock, lifecycle status (active, NRND, EOL), datasheet link.
  - BOM page shows lifecycle warnings. Results are cached with a timestamp and shown as "as of <date>".

- [ ] 20. **Cost rollup**
  - BOM cost per quantity breakpoint from provider pricing; clearly marked as an estimate.

- [ ] 21. **Compliance flags**
  - RoHS and REACH flags where the provider supplies them, shown as informational only.

- [ ] 22. **Alternate parts**
  - Suggest alternates for EOL or low-stock parts; suggestions are informational and never change a BOM.

---

## Phase 6: AI (optional, off by default)

- Per-project switch, off by default, with plain wording about what data is sent to which provider.
- AI output is always labeled as AI-generated and never written into a published release.

- [ ] 23. **Release notes draft**
  - Generate a draft from the diff between two releases; the user edits before saving.

- [ ] 24. **BOM finding explanations**
  - Explain deterministic findings from item 1 in plain language. The finding itself is never produced by AI.

- [ ] 25. **Ask the project**
  - Question answering over published documents and metadata, with citations to the exact release and file.

- [ ] 26. **Datasheet reading and requirement drafts**
  - Extract key parameters from an uploaded datasheet and propose draft requirements for review.

---

## Out of scope

- Automatic PCB placement or routing.
- General project and task management (boards, sprints, assignees).
- Replacing ECAD, PLM or ERP tools.
- Editing design files in the browser.

## Future scope 
- Self-hosted distribution.
- Production Packages : Pre-Configure packages for users to download.
- Subscription Plans: Introduce different subscription plans for different features and usage limits.
- CAD integrations: Integrate with popular CAD tools to automate the release process.
- StrictDoc: Integrate with StrictDoc to automate the release process and requirement bi-directional sync. 
- Webhooks: Add support for webhooks to notify other systems when a release is published.
- Web view for StrictDoc Requirements: Create a web view for StrictDoc requirements to allow users to view requirements in the browser without downloading the file. 
- Share view for releases: Create a share view for releases to allow users to share releases with others.

