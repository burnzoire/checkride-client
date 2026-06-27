// Real DCS unit-attribute strings used to classify kills. The mission script forwards a
// victim's FULL attribute set verbatim as `victimRoles`; these are the subsets that mean
// "armour" and "SEAD target". Defined ONCE so the achievements (tankKiller/doubleKill)
// and the gauge computation (achievementEngine.serializeState) can't drift — a missed
// update in one copy silently undercounts a stat. Mirrors the mission script's
// getRoleCoalition classifier and the harvest-vocab assumption list.
//
// "Armour", "SAM", "SAM launcher", "Helicopters" are DEAD strings — never real DCS
// attributes; do not reintroduce them.
const ARMOUR_ROLES = ['Tanks', 'Modern Tanks', 'Old Tanks', 'IFV', 'APC'];

const SEAD_ROLES = [
  'SAM TR', 'SAM SR', 'SAM LL', 'SAM CC', 'LR SAM', 'MR SAM', 'SR SAM',
  'Static AAA', 'Mobile AAA',
];

module.exports = { ARMOUR_ROLES, SEAD_ROLES };
