# Project Rules
- Implement ONLY what is explicitly defined in SPEC.md. Do not add unrequested features, extra dependencies, or over-engineered abstractions.
- Stop and ask for user confirmation before making any breaking changes to the existing architecture or database schema.
- Keep code modular, strictly typed, and free of unused imports or dead code.

Standing instructions for any AI agent working in this repository. Read this file, SPEC.md and DECISIONS.md at the start of every session before doing anything else.

Hardware Release Ledger: a project memory and release ledger for hardware teams. The product description, stack and design rules are in SPEC.md (principles section) and in the existing code. Follow the existing architecture, src/theme/tokens.ts, src/i18n/en.json and the migration conventions.

How to pick work

The roadmap lives in SPEC.md as a numbered checklist. - [x] means done, - [ ] means not done.

When the user says anything like "next", "continue", "start the next item", "sıradaki" or "devam":

Read SPEC.md. Find the first unchecked item in numeric order.
Check whether it is already partly done: look at git log, git status, DECISIONS.md and the code. If there is unfinished work for that item, continue it instead of starting over.
If the item depends on another unchecked item (for example item 8 needs items 1 and 7), do not start it. Say so in one sentence and pick the first unchecked item whose dependencies are all done.
Tell the user in one or two sentences which item you picked and why, then start. Do not ask for confirmation unless the situation is genuinely ambiguous (for example, two items are half-finished).

When the user names an item number ("do item 7"), do exactly that item and ignore the order.

Rules for every item
Work on one item only. Do not start the next item, and do not add preparation code for later items.
Write a short plan first (files, migrations, pages, tests), then implement. For items marked large in the user's request, stop after the plan and wait for approval.
Every schema change is a new migration file. Never edit an existing migration.
Keep RLS on every table. Published releases and their snapshots must stay immutable.
Deterministic checks (hashes, BOM/PnP consistency, completeness) are plain code. Never delegate them to AI.
No hardcoded colors outside tokens.ts. No hardcoded UI strings outside en.json. All copy is English, short and neutral.
Never put the Supabase service_role key in client code. Do not touch production credentials.
Do not delete or overwrite user files outside the project. Do not run destructive commands (rm -rf, force pushes, dropping databases) without asking.
Add tests for new logic. Run npm run typecheck, npm run lint and npm run test and fix all errors before finishing.
Finishing an item
Check every acceptance note of the item in SPEC.md one by one.
If all are met: change its box to - [x] in SPEC.md, commit with the message feat: <item number> <short item title>.
If some are not met: leave the box unchecked, add a one-line note under the item in DECISIONS.md describing what is missing, and say so in the report.
Add any decisions you made to DECISIONS.md as single lines.
Stop. Do not continue to the next item.
Report format

End every item with a short report:

Item: number and title
Done: what was built (2-4 lines)
Verified: which checks and tests passed
Not done or open: anything missing, with the reason
Next: the number and title of the next item that would be picked

No decoration, no exaggeration, no speculative extras.