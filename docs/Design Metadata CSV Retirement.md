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
  (`Proficiencies::NameLookup`). The only proficiencies still leaning on the CSV's
  `weapon_category`/`weapon_guidance` are `rockets`, `bombs_unguided/laser/gps/tv`,
  and `hellfire_laser/radar`. **Re-key those to weapon families** (`BOMBS_LASER`,
  `BOMBS_GPS`, `AGM-114-LASER`/`-RADAR`, …) whose `type_names` are derived from the
  CSV's own columns. Then no proficiency references category/guidance and the CSV
  drops out. Net: weapon proficiencies become 100% YAML config keyed on weapon_name.
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

**Apply as a read-time translation — do NOT backfill at cutover.** Old event rows
stay frozen with their CSV values; new events carry raw DCS `event_data.metadata`. A
single canonical translation map normalizes BOTH input vocabularies (legacy CSV
values + DCS-native values) to one canonical output at read, so a stat shows one
coherent series across the cutover with zero row rewrites. Consequence: new events
need no ingest-time resolution — store the raw DCS metadata, translate on the way
out. Wrinkle: the tag-schema stats are **materialized counters** (`tag→count`), so
the translation applies at the **tag-normalization/rollup layer**, not just a UI
label swap.

## Implementation oddities to expect (don't retire blind)

1. **Cutover seam — resolved by the read-time translation map, not backfill.** Old
   events keep CSV values; new events carry DCS-native values; the canonical
   translator folds both at the tag-normalization layer. Only `jet`/`prop` history
   folds to `air`. No row rewrites.
2. **`AdminMetadataPage.tsx` orphaned** — it's the CSV editor UI; retiring the tables
   breaks it. Fold into the stats pages rework.
3. **Lost auto-discovery** — `event_ingestor` does `find_or_create_by!` on unknown
   weapons/units (a "flag the new thing" safety net). YAML config has no equivalent;
   a new module's weapon silently gets no metadata until noticed. Restore with an
   unmapped-value breadcrumb (log/alarm when an attribute or weapon hits no rule).

## End-state ladder: parallel → validate → backfill → drop columns

The legacy resolved columns drop only at the very end, gated by a well-tested
backfill. Two distinct backfills — don't conflate:
- **Cutover backfill** — declined. Rewriting history just to launch; unnecessary
  because the read-time translator handles the seam.
- **Cleanup backfill** — deliberate, late, and the **prerequisite for dropping the
  columns** (not optional polish).

Why the backfill gates the drop: the translator reads whatever an event carries. New
events carry `event_data.metadata`; **old events carry only the legacy columns (no
metadata — they predate enrichment).** Drop those columns first and old events lose
their taxonomy. So the cleanup backfill must first relocate old events' taxonomy OUT
of the doomed columns — synthesize the canonical form (or `event_data.metadata`)
FROM each old event's legacy column value via the same translation map
(deterministic; the legacy value is the input, no DCS needed).

The parallel run is a free correctness oracle: keep CSV enrichment ALIVE during
parallel so new events carry BOTH the legacy columns and the DCS metadata, then
continuously assert `translate(event_data.metadata) == legacy_column` and alarm on
mismatch. Agreement over representative traffic is what earns trust to backfill.

Safe-backfill properties (events table is partitioned by month): idempotent,
batched/throttled per partition, shadow-write + diff before drop. The column drop is
the one irreversible step — last.

Ladder:
1. New events get DCS metadata; read-time translator reconciles old(columns) +
   new(metadata). **CSV stays alive as oracle.**
2. Validate `translate(metadata) == legacy_column` on new traffic.
3. Stop CSV enrichment (new events DCS-only).
4. Backfill old events: synthesize canonical taxonomy from their legacy column values.
5. Validate backfill (shadow diff).
6. **Drop legacy columns** (irreversible — last).

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
  `ARMOUR_ROLES` / mission Lua). Re-key the bomb/rocket/hellfire proficiencies to
  weapon families derived from `weapon_metadata.csv` (group weapon_name by
  category+guidance), splice into `proficiencies.yml`, re-point to
  `KILLS_BY_AIRFRAME_WEAPON_FAMILY`.
- **Phase 1 — backend consumes metadata (parallel).** Backend reads
  `event_data.metadata` and applies the read-time translation alongside the still-live
  CSV enrichment. New events carry both → oracle active.
- **Phase 2 — validate.** `translate(metadata) == legacy_column` holds on live
  traffic. Retire the weapon CSV once its proficiencies are family-sourced.
- **Phase 3 — stop CSV, backfill, validate.** Stop CSV enrichment; backfill old
  events' canonical taxonomy from their legacy column values; shadow-diff.
- **Phase 4 — drop legacy columns** (irreversible — last).

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
