# Plan: Single Source of Truth for Achievement Definitions

## Problem

Achievement metadata is duplicated across three repos and drifts out of sync:

| Repo | What it holds today | Where |
| --- | --- | --- |
| **checkride-client** | `id`, `name`, `description`, `triggerType`, `iconHint`, `iconDescription`, and the **unlock logic** (`evaluate()`) | `app/achievements/*.js`, registered in `app/achievements/index.js` |
| **checkride** (API) | `id`, `name`, `description`, plus category grouping and a removed/disabled denylist | `app/controllers/achievements_controller.rb` (`DEFINITIONS`, `DISABLED_ACHIEVEMENT_IDS`) |
| **checkride-ui** | `id` → emoji icon map; descriptions fetched from the API | `src/constants/achievementIcons.ts` |

Symptoms we have already hit:
- Removing "Boom Shakalaka" / "Basket Case" required edits in all three repos.
- The Top Up description said "within 10 minutes" on the API while the client said "within 15 minutes" — silent drift.
- Adding an achievement means touching the client (logic + metadata), the API (`DEFINITIONS`), and the UI (icon map).

## Goal

**The client is the single source of truth.** It already owns unlock logic; it should also own all presentation metadata (name, description, category, icon). The API and UI consume a generated manifest instead of maintaining their own copies.

## Target architecture

```
checkride-client/app/achievements/*.js   ← authoritative definitions + logic
            │  (build step: npm run build:achievements)
            ▼
   achievements.manifest.json             ← generated artifact (public fields only)
            │
   ┌────────┴─────────┐
   ▼                  ▼
checkride (API)   checkride-ui
consumes manifest  consumes manifest (icons + descriptions)
```

The manifest carries only **public** fields — never `evaluate()` or internal trigger details unless a consumer needs them:

```json
{
  "version": "1.5.3",
  "achievements": [
    {
      "id": "quick_tank",
      "name": "Top Up",
      "description": "Take on at least 10% fuel within 15 minutes of takeoff.",
      "category": "air_to_air_refueling",
      "icon": "⏱️",
      "status": "active"
    }
  ]
}
```

`status` is `active` | `removed`. `removed` entries replace the API's `DISABLED_ACHIEVEMENT_IDS` denylist — the API keeps rejecting them at ingest and hides them from the catalog, but the rule now lives with the definition.

## Implementation steps

### 1. Extend the client achievement model (checkride-client)

In `app/achievements/achievement.js`, add the presentation fields to the constructor:
- `category` — e.g. `general`, `carrier`, `air_to_air_refueling`, `air_to_air`, `air_to_ground`, `helicopter`.
- `icon` — the emoji (migrate from the UI's `ACHIEVEMENT_ICONS` map).
- `status` — defaults to `active`. Removed achievements either keep a tombstone entry with `status: 'removed'` or are tracked in a small `removed.js` list (see step 4).

Backfill these fields across `app/achievements/*.js`. Source the emoji from the current `checkride-ui/src/constants/achievementIcons.ts`, and the categories from the API's grouping comments (`# General`, `# Air-to-Air Refueling`, etc.).

### 2. Add a manifest generator (checkride-client)

New script `scripts/buildAchievementsManifest.js`:
- `require('../app/achievements')` (the `ALL_ACHIEVEMENTS` array) plus the removed-tombstone list.
- Emit `build/achievements.manifest.json` with the public fields and the current `package.json` version.
- Wire `npm run build:achievements`; run it as part of `prepare:lua` / `dist` so the manifest ships with every release.
- Add a Jest test asserting every active achievement has a non-empty `name`, `description`, `category`, and `icon`, and that ids are unique.

### 3. Distribute the manifest

Pick one (recommended: **A**, since the client already talks to the API and nothing else does):

- **A — Client registers its catalog with the API.** On startup (or on the existing `ready`/heartbeat path), the client POSTs the manifest to a new `PUT /achievements/catalog` endpoint. The API persists it (DB table or cache) and serves it from `GET /achievements`. Pro: zero manual sync, catalog always matches the running client version. Con: API must handle an empty/missing catalog gracefully (fall back to last known).
- **B — Publish the manifest as a release artifact.** Commit `achievements.manifest.json` to the client repo and/or attach it to the GitHub release. The API and UI pull it in via a sync script / CI step. Pro: no runtime coupling. Con: still a sync step, just automated.

### 4. Switch the API to the manifest (checkride)

- Replace the hardcoded `DEFINITIONS` array in `achievements_controller.rb` with the manifest (loaded from DB/cache for option A, or from a vendored JSON for option B).
- Derive the ingest denylist from `status: 'removed'` entries instead of `DISABLED_ACHIEVEMENT_IDS`.
- Keep server-only concerns where they are: rarity stats, `earned_count`, persistence, the `recent` feed. The `recent` endpoint already falls back to a humanized id when a definition is missing — keep that.
- Update specs that reference `DEFINITIONS` / `DISABLED_ACHIEVEMENT_IDS` to read from the new source.

### 5. Switch the UI to the manifest (checkride-ui)

- Remove `src/constants/achievementIcons.ts`; read `icon` from the API catalog response (which now originates from the manifest).
- Keep `DEFAULT_ACHIEVEMENT_ICON` as the fallback for any id missing an icon.
- Descriptions already come from the API — no change beyond ensuring the field is passed through.

### 6. Decommission the duplicates

Once A/B is proven in staging: delete the API's inline metadata and the UI's icon map, leaving only the manifest-derived path.

## Migration / sequencing

1. Land steps 1–2 in the client (additive — manifest exists, nothing consumes it yet). Safe to ship.
2. Land step 4 behind a fallback: API prefers the manifest, falls back to the existing `DEFINITIONS` if the manifest is absent. Verify catalog output is byte-identical to today.
3. Land step 5 in the UI.
4. Remove the fallbacks and duplicates (step 6).

Each step is independently shippable and reversible.

## Risks & notes

- **Version skew:** if multiple client versions run in the field (option A), the API catalog reflects whichever last registered. Include `version` in the manifest and consider only accepting catalogs from `>=` the stored version.
- **Earned rows for removed achievements:** existing `PilotAchievement` rows for `first_basket_contact` / `first_boom_contact` persist. The `recent` feed humanizes unknown ids; decide whether to keep tombstone metadata so they still render with their old name/icon.
- **Icons as data vs assets:** emojis live fine in the manifest. If icons later become image assets, the manifest should carry an asset key/URL, and the existing `iconHint` / `iconDescription` fields are the natural source for generating them.
- **Don't leak logic:** the manifest must not serialize `evaluate()` or anything that would let a consumer re-derive unlock rules — those stay client-only.

## Out of scope (for now)

- Achievement icon **image** generation pipeline.
- Backfilling display metadata onto historical `PilotAchievement` rows.
