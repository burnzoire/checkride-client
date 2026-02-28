/**
 * Canonical list of all active achievements, in the order they are evaluated.
 * Import this array into AchievementEngine.
 */
const carrierQualified = require('./carrierQualified');
const nightQualified = require('./nightQualified');
const threeWire = require('./threeWire');
const comebackKid = require('./comebackKid');
const bolterBolter = require('./bolterBolter');
const jokerState = require('./jokerState');

const ALL_ACHIEVEMENTS = [
  carrierQualified,
  nightQualified,
  threeWire,
  comebackKid,
  bolterBolter,
  jokerState,
];

module.exports = ALL_ACHIEVEMENTS;
