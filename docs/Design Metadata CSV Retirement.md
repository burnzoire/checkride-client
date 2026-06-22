# Design: Retiring the Metadata CSV

Status: **active plan (2026-06-21).** Goal: retire the backend metadata CSVs
(`unit_metadata`, `weapon_metadata`, `airdrome_metadata`) while keeping
weapon-family proficiencies. Companion to the DCS metadata initiative
(`event_data.metadata`, see ARCHITECTURE.md). An earlier role-based proficiency
pivot was explored and **not pursued** — summarised in the appendix.

## Problem

The backend enriches each event from hand-maintained metadata CSVs that map
unit/weapon names → taxonomy (family, domain, category, role, guidance). That
curation is what we want to retire. The weapon-family **proficiencies** themselves
stay — adding new weapons to `weapon_families` config is part of the normal
airframe-release cadence (e.g. F-14B(U) → add GBU-31), an acceptable, expected cost.
Sourcing weapon *guidance* from DCS is a **non-goal**: proficiencies key on names +
families, so the `getDesc()` guidance ceiling is irrelevant to them.

## Approach

**Rule: `family` → YAML config; everything else → DCS — except GPS guidance, which
DCS cannot express, so GPS bombs are resolved by a YAML weapon family (a name list),
exactly like any other family.**

### What each CSV takes

- **`weapon_metadata.csv`** → `weapon_family` is already YAML-authoritative
  (`Proficiencies::NameLookup`). Apply the **balance principle** to the proficiencies
  still leaning on the CSV's `weapon_category`/`weapon_guidance`:
  - **Explicit/named proficiencies** (Sidewinder, Maverick, Hellfire, R-73, APKWS, …)
    already key on YAML weapon families — unchanged.
  - **Generic proficiencies** (`rockets`, `bombs_unguided/laser/tv`) keep their
    existing `weapon_category`/`weapon_guidance` filters but **re-source those tags
    from DCS `event_data.metadata`** (via the translation map), not the CSV. DCS reports
    `category=ROCKET`, `guidance=LASER` directly, so there is no need to hand-enumerate
    `type_names` into bucket families.
  - **`hellfire_laser`/`hellfire_radar`** stay on family `AGM-114` + DCS-sourced
    guidance; the combined `hellfire` (family `AGM-114`) stays. **Do not split AGM-114.**
  The **one** value DCS cannot express is **GPS** (a JDAM reports `guidance=none`), so
  GPS bombs are identified by a **YAML name list** the translation map uses to stamp
  `weapon_guidance=gps` (which also keeps JDAMs out of `bombs_unguided`). Net: the CSV
  is no longer the *source* of weapon category/guidance — the translation map (+ GPS
  name list) supersedes it — so the CSV can drop out.
- **`unit_metadata.csv`** → `unit_family` already YAML (airframes). The victim
  domain/category/role + victim family it provides feed **stats schemas only**
  (`KILLS_BY_VICTIM_*`), not leveled proficiencies — source those from the
  DCS-native `event_data.metadata` the client already ships (`victimUnitCategory`,
  attributes). This is the original metadata-initiative Phase 1.
- **`airdrome_metadata.csv`** → `airdrome_type` (stats only); source carrier/airbase
  from the mission enrichment `isCarrier`, or keep a trivial carrier list.

### Column-by-column retirement map (definitive)

| CSV column | Example | Source after retirement | DCS derivation |
|---|---|---|---|
| `weapon_family` | `AIM-120`, `GBU-38` | **YAML** `weapon_families` | — (name list) |
| `weapon_category` | `missile`, `bomb`, `rocket`, `gun` | **DCS** | `getDesc().category` → MISSILE/BOMB/ROCKET/SHELL |
| `weapon_guidance` | `laser`, `infrared`, `active_radar`, `tv` | **DCS** | `getDesc().guidance` → LASER/IR/RADAR_ACTIVE/TV |
| `weapon_guidance` | **`gps` / `gps_laser`** | **YAML family ⚠️** | DCS returns nothing for a JDAM — identify by name |
| `unit_family` | `F/A-18`, `M-1` | **YAML** (airframes) | — (name list) |
| `unit` domain | `air`, `ground`, `sea` | **DCS** | `getDesc().category` → AIRPLANE/GROUND_UNIT/SHIP |
| `unit` category / role | `armor`/`tank`, `sam`, `fighter` | **DCS** | `getDesc().attributes` → `Tanks`, `SAM TR`, `Fighters` |
| `airdrome_type` | `carrier` | **DCS** | mission enrichment `isCarrier` |
| `weapon_role`, granular `unit_role` | `a2a`, `interceptor` | **drop** | unused by any tag schema/proficiency |

**Worked examples:**
- **AIM-120C** — family `AIM-120` (YAML) · category `missile` (DCS MISSILE/AAM) ·
  guidance `active_radar` (DCS RADAR_ACTIVE). ✅ fully covered.
- **GBU-12** — family `GBU-12` (YAML) · category `bomb` (DCS BOMB) · guidance
  `laser` (DCS LASER). ✅ fully covered.
- **GBU-38 (JDAM)** — family `GBU-38` (YAML) · category `bomb` (DCS BOMB) · guidance
  `gps` → **DCS gives nothing; resolved via the YAML family.** ⚠️ the lone exception.
- **M-1 Abrams** — domain `ground` (DCS GROUND_UNIT) · category `armor`/role `tank`
  (DCS attribute `Tanks`). ✅
- **Hawk launcher** — domain `ground` · category `sam` (DCS attributes
  `SAM TR`/`SAM SR`/`SAM LL`). ✅

## The linchpin: a DCS-attribute → legacy-taxonomy translation

The per-unit/per-weapon CSV rows are replaced not by re-deriving forward but by a
small set of rules that map DCS's native vocabulary onto the **existing** category/
role taxonomy — so DCS-sourced events speak the same language the CSV produced and
there is no cutover seam. ~30 attribute rules replace thousands of per-row entries,
and they auto-cover every new module.

Unit attributes → legacy category/role (built from `harvest:vocab`):

| DCS attribute | legacy category | legacy role |
|---|---|---|
| `Tanks` / `Modern Tanks` / `Old Tanks` | `armor` | `tank` |
| `IFV` / `APC` | `armor` | `ifv` / `apc` |
| `SAM TR/SR/LL/CC`, `LR/MR/SR SAM` | `sam` | `sam` |
| `Static AAA` / `Mobile AAA` | `air_defense` | `aaa` |
| `Fighters` / `Multirole fighters` | _(air)_ | `fighter` |
| `Bombers` / `Strategic bombers` | _(air)_ | `bomber` |
| `Attack/Transport helicopters` | `helicopter` | … |
| `Frigates`/`Cruisers`/`Destroyers`/`Unarmed ships` | `ship` | … |
| `Trucks`/`Cars`/`Infantry`/`UAVs` | `truck`/`car`/`infantry`/`drone` | … |

Weapon class/guidance → legacy: `BOMB`→`bomb`, `MISSILE`+`AAM`→`missile`,
`ROCKET`→`rocket`, `SHELL`→`gun`; `LASER`→`laser`, `RADAR_ACTIVE`→`active_radar`,
`RADAR_SEMI_ACTIVE`→`semi_active_radar`, `IR`→`infrared`, `TV`→`tv`. (GPS → family.)

Almost nothing coarsens — `armor`/`sam`/`tank`/`ship`/`helicopter` are faithfully
reproduced from attributes. The only genuinely unmappable value is `jet`/`prop` (no
propulsion attribute; a P-51D's full attribute set is `{wsType_Air, wsType_Airplane,
wsType_Fighter, "Battleplanes"}`), which is **dropped by decision** (stats-only, the
pages are slated for rework, jet-vs-prop targets aren't valued).

**Storage model: flat hot columns + a jsonb cold sidecar — `events` stays wide.**
The `events` table is deliberately wide and flat (discrete `character varying`
columns: `weapon_category`, `weapon_guidance`, `victim_unit_domain`,
`victim_unit_category`, …), partitioned by month, with **no jsonb on the hot path**.
The materializer, the `feed_items_v1` view, and all filters/sorts read those flat
columns — that's the efficiency contract and it does not change. So:

- **Translate at INGEST into the existing flat columns.** `event_ingestor` keeps
  populating the same taxonomy columns; only the *source* changes — from the CSV cache
  lookup to `Metrics::TaxonomyTranslator(event_data.metadata)`. Readers are untouched.
- **Persist the raw DCS metadata now, in a `jsonb metadata` sidecar.** It is
  write-once / read-rarely (replay, backfill, future mission-proficiency derivations),
  TOASTed out-of-line, and **never read on the hot path** — so it doesn't violate the
  wide-column design. Persist it immediately, even before consumption is live: today
  `event_ingestor` *drops* `metadata` (only keys matching real columns survive
  `data.slice`), so every event in the interim is lost unless we capture it now.

This replaces the earlier "read-time / translate on the way out" idea: a jsonb store
read on the hot path would fight the wide-table design, and read-time translation only
buys "map fixes apply to all history instantly." We trade that for the flat hot path —
the cost is that improving the map later means a **replay/backfill** (re-run the
translator over the stored `metadata` to rebuild the flat columns and re-materialize
counters). Wrinkle: the tag-schema stats are **materialized counters** (`tag→count`)
built at materialization (which runs at ingest), so the translator must be applied
there — the canonical value lands in both the flat column and `MetricCounter.tags`.

## Event column decisions: keep / drop / add (2026-06-22)

A grep of `tag_schemas.rb`, `proficiencies.yml`, the `feed_items_v1` view, serializers
and specs established exactly which taxonomy columns are read. Decisions:

| Action | Column(s) | Source after retirement | Rationale |
|---|---|---|---|
| **Keep** | `killer_unit_family`, `victim_unit_family`, `unit_family`, `weapon_family` | `NameLookup` (YAML) | Live; already YAML-authoritative |
| **Keep** | `weapon_category`, `weapon_guidance` | `TaxonomyTranslator` (metadata) | Live weapon proficiencies/stats |
| **Keep** | `victim_unit_category` | `TaxonomyTranslator` (metadata) | Live + the lever for richer target stats (finer grain) |
| **Keep** | `killer_unit_category`, `unit_category` | `TaxonomyTranslator` (metadata) | Currently unread — retained for future stats expansion |
| **Keep** | `airdrome_type` | mission `isCarrier` / trivial list | Live (landings by type) |
| **Drop** | `killer_unit_domain`, `victim_unit_domain`, `unit_domain` | — | Deterministic rollup of category; re-derive any time |
| **Drop** | `killer_unit_role`, `victim_unit_role`, `weapon_role`, `unit_role` | — | Unread; finer grain re-derivable from raw attributes |
| **Add** | `metadata` (`jsonb`) | client `event_data.metadata` | Insurance — see below |

Keep 9, drop 7 (3 domains + 4 roles). Both drop classes are **reversible**: domain is a
category rollup; role/finer-grain re-derives from the raw attributes — *provided the raw
metadata is persisted* (the `metadata` add). `KILLS_BY_VICTIM_DOMAIN*` simply roll up
from category instead of reading a column.

**Explicitly NOT captured:** per-kill engagement range (`distanceNm`). The client
computes it but doesn't attach it to the kill; we are choosing not to store it. Recorded
so it's a conscious omission, not an oversight.

**Finer victim category** (e.g. `tank`/`ifv`/`apc`/`artillery`/`sam`/`aaa`/`manpad`,
ship-by-class) is a *translator value change*, not a new column — and it absorbs what the
dropped `role` columns would have provided.

### The `metadata` jsonb sidecar (the linchpin add)

Persist the client's raw `event_data.metadata` into a `jsonb metadata` column at ingest,
**now** — additive, no consumption. It is the project's insurance and pays off three ways:

1. **Gap-proofing.** DCS can't be re-queried for past events, so anything not captured
   at ingest is lost forever. With the raw blob retained, *every* column drop/coarsening
   above is reversible — re-derive any granularity later by replay.
2. **Stops active data loss.** Today `event_ingestor` *drops* `metadata` (only keys
   matching real columns survive `data.slice`); every event until this ships loses its
   raw taxonomy.
3. **Client verification.** Persisting the blob lets us inspect exactly what the new
   client emits in prod — an easy way to validate the client release before any backend
   consumption.

**Contract: never read on the hot path.** It is write-once / read-rarely (replay,
backfill, future mission proficiencies, verification), TOASTed out-of-line, so it does
not compromise the wide-flat design.

## Implementation oddities to expect (don't retire blind)

1. **Cutover seam lives in the column *values*, and IS backfilled.** Because we keep
   the flat columns and fill them at ingest, old rows hold legacy vocab
   (`cluster_bomb`, `radar`, `sea`) while new rows hold canonical vocab (`bomb`,
   `active_radar`, `sea`). A column with mixed vocab makes a stat incoherent, so old
   rows must be normalized **in place** — run the translator's *legacy-input* side over
   each old column value (deterministic; the legacy value is the input, no DCS needed).
   Columns are NOT dropped; their values are normalized.
2. **`AdminMetadataPage.tsx` orphaned** — it's the CSV editor UI; retiring the tables
   breaks it. Fold into the stats pages rework.
3. **Lost auto-discovery** — `event_ingestor` does `find_or_create_by!` on unknown
   weapons/units (a "flag the new thing" safety net). YAML config has no equivalent;
   a new module's weapon silently gets no metadata until noticed. Restore with an
   unmapped-value breadcrumb (log/alarm when an attribute or weapon hits no rule).
   Implemented in `Metrics::TaxonomyTranslator#breadcrumb`.
4. **`hellfire_radar` proficiency filter must flip when the column source switches.** It currently filters
   `weapon_guidance: radar` (the legacy CSV value for AGM-114L). DCS reports AGM-114L as
   `RADAR_ACTIVE`, which the translator canonicalises to `active_radar` — so when the
   guidance tag is re-sourced from metadata, the filter must change to
   `weapon_guidance: active_radar`. Do NOT change it earlier: while the raw CSV column
   still feeds the tag, `active_radar` would not match and the proficiency would break.

## End-state ladder: persist → parallel → validate → switch → backfill → retire CSV

**What gets retired is the CSV *tables* (`unit_metadata`/`weapon_metadata`/
`airdrome_metadata`) + `AdminMetadataPage` — NOT the event taxonomy columns.** The
columns remain the canonical hot-path store; we only change what fills them (CSV →
translator) and normalize their historical values.

The parallel run is a free correctness oracle: keep CSV enrichment ALIVE during
parallel so each new event gets its columns filled by CSV (authoritative) AND carries
the raw `metadata`, then continuously assert
`translate(event_data.metadata) == legacy_column` and alarm on mismatch. Agreement
over representative traffic is what earns trust to switch the column source.

Two distinct backfills — don't conflate:
- **Cutover backfill** — declined. No need to rewrite history just to launch.
- **Cleanup backfill** — deliberate, late: normalize old rows' column *values* from
  legacy vocab to canonical, in place, via the translator's legacy-input side
  (deterministic; **old events predate `metadata`, so the legacy column value is the
  only input — no DCS needed**). Also re-materialize/migrate the counters built from
  those old values so `MetricCounter.tags` share one vocab.

Safe-backfill properties (events table is partitioned by month): idempotent,
batched/throttled per partition, shadow-write + diff. No irreversible column drop — the
columns stay; the one-way step is dropping the CSV *tables*, done last.

Ladder:
1. **Persist now.** Add the `jsonb metadata` sidecar; `event_ingestor` writes the raw
   DCS metadata. CSV still fills the flat columns. (Can ship immediately — additive,
   no consumption.)
2. **Parallel oracle.** Compute `translate(metadata)` at ingest and assert it equals
   the CSV-filled column; alarm on mismatch. Translation is shadow-only — it does NOT
   feed the columns or any user-facing stat yet.
3. **Validate** agreement on representative traffic.
4. **Switch the source.** Fill the flat columns from `translate(metadata)` instead of
   the CSV; stop CSV enrichment. Flip `hellfire_radar` filter to `active_radar` here.
5. **Cleanup backfill + re-materialize.** Normalize old rows' column values to canonical
   in place; re-materialize/migrate affected counters; shadow-diff.
6. **Retire the CSV tables** + `AdminMetadataPage` (the one-way step — last).

## Supporting findings

1. **`getDesc()` is the only runtime weapon surface** — three useful integers:
   `category` (Weapon.Category), `missileCategory`, `guidance` (Weapon.GuidanceType).
   `scheme`/`class_name`/flight model are static-DB only, not exposed to scripting.
2. **GPS is not representable in `getDesc()`** — Weapon.GuidanceType has no GPS
   member; a JDAM is distinguishable from a dumb bomb only via `scheme`/`class_name`,
   which `getDesc()` does not return. Hence GPS stays a YAML family. (This is why
   sourcing guidance from DCS is a non-goal.)
3. **The mod's enum tables contradict the documented Weapon.GuidanceType**
   (`GUIDANCE_NAMES`/`MISSILE_CATEGORY_NAMES` vs Hoggit). Irrelevant to the CSV
   retirement (guidance from DCS is a non-goal) but recorded so no one re-sources
   guidance from those tables assuming they're authoritative.
4. **`harvest:vocab` proved three assumed role strings are DEAD** — fix before the
   translation map (and the achievements) rely on them:
   - `ARMOUR_ROLES` (tankKiller.js/doubleKill.js) contains `Armour`, never declared.
     Real: `Tanks`/`Modern Tanks`/`Old Tanks`/`IFV`/`APC`.
   - Mission Lua SEAD detect checks `SAM`/`SAM launcher`, neither declared. Real:
     `SAM TR`/`SR`/`LL`/`CC`, `LR/MR/SR SAM`, `Static/Mobile AAA` (`SAM launcher` →
     `SAM LL`).
   - Mission Lua air detect checks `Helicopters`, not declared. Real: `Attack
     helicopters`/`Transport helicopters`.

## Tooling

- **`app/scripts/harvest-unit-attributes.js`** (`npm run harvest:vocab -- "D:\DCS
  World"`) — harvests the role vocabulary OFFLINE by parsing `attribute = {…}` blocks
  in the install's readable Lua (CoreMods/Mods — tanks, ships, aircraft), and diffs
  it against the client's assumed role strings. Covers every Lua-declared unit;
  misses only any unit shipped as a binary-only DB entry. This is what built the
  attribute→legacy mapping and found the dead role strings above.

## Phased plan

- **Phase 0 — prep (client + config).** Build the attribute→legacy translation map
  from `harvest:vocab` output. Fix the dead role strings (in the map and in
  `ARMOUR_ROLES` / mission Lua). Add the **GPS-bomb name list** to `proficiencies.yml`
  (consumed by the translation map). The generic weapon proficiencies keep their
  `weapon_category`/`weapon_guidance` filters (re-sourced from metadata when the column
  source switches, Phase 3); explicit family proficiencies and the combined
  `hellfire`/`AGM-114` are unchanged.
- **Phase 1 — persist raw metadata (additive, ships immediately).** Add the
  `jsonb metadata` sidecar column; `event_ingestor` writes the client's
  `event_data.metadata` into it. CSV still fills the flat columns; no consumption yet.
  This stops the current data loss (metadata is dropped at ingest today) and enables
  later replay + mission proficiencies.
- **Phase 2 — consume in parallel, validation is the gate.** At ingest, compute
  `TaxonomyTranslator(metadata)` as a **shadow/oracle only**, alongside the still-live
  CSV-filled columns, and assert it equals the CSV value. **Translation is NOT used to
  fill columns or any user-facing stat until agreement holds on representative
  traffic** — validation gates consumption. Alarm on mismatch.
- **Phase 3 — switch the source.** Fill the flat columns (and counter tags) from
  `TaxonomyTranslator(metadata)` instead of the CSV; stop CSV enrichment; flip the
  `hellfire_radar` filter to `active_radar`.
- **Phase 4 — cleanup backfill + retire CSV.** Normalize old rows' column values to
  canonical in place via the translator's legacy-input side; re-materialize/migrate
  affected counters; shadow-diff. Then retire the CSV *tables* + `AdminMetadataPage`.
  **Columns are kept, not dropped.**

---

## Appendix: two-level proficiencies (deferred future feature)

Not part of the CSV retirement, but **worth keeping on the roadmap.** The motivation
is a real UX gap: the current flat proficiency list (`combat`, `flight hours`,
`AIM-9`, `Maverick`, …) **feels lost** — there's no organizing altitude above the
individual items, so each one reads as orphaned.

The idea: organize proficiencies into two levels —
- **Layer 1 — Mission Qualifications:** qualification *areas* the pilot trains in —
  Airmanship (Flight Hours, Landings, Carrier Qual, AAR), Counter-Air (BVR = radar
  AAM, WVR = IR AAM, Guns), Surface Attack (SEAD vs air defence, Anti-Armor vs
  armour, Maritime vs ships, Interdiction). Native-sourced (employment for A2A,
  target class for A2G), a coverage rollup so no kill is uncounted.
- **Layer 2 — System Checkrides:** the existing weapon-family proficiencies
  (AMRAAM, Maverick, APKWS…), retained — mastery of a specific system, grouped
  under their mission area.

A single kill feeds both layers, so e.g. a Maverick-on-tank counts toward the
**AGM-65** checkride *and* the **Anti-Armor** qualification.

**Two ways to land it, cheap → rich:**
1. **Grouping only (cheap win, no new sourcing).** Just group the *existing*
   proficiencies under qualification-area headings (Airmanship / Air-to-Air /
   Air-to-Ground). Pure presentation — directly fixes the "feel lost" problem
   without any backend change.
2. **Full two-layer (richer).** Add the native role-based Layer-1 mission quals as
   real proficiencies on top of the grouping. Independent of the CSV work; could be
   built once `event_data.metadata` is consumed server-side.

Earlier exploration (the per-airframe Layer-1/Layer-2 assignment tables) lives in
git history if/when this is picked up.
