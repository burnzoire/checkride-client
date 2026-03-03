/**
 * Canonical list of all active achievements, in the order they are evaluated.
 * Import this array into AchievementEngine.
 */
const carrierQualified = require('./carrierQualified');
const nightQualified = require('./nightQualified');
const threeWire = require('./threeWire');
const textbookTrap = require('./textbookTrap');
const comebackKid = require('./comebackKid');
const bolterBolter = require('./bolterBolter');
const barelyRecovered = require('./barelyRecovered');
const fleetDefender = require('./fleetDefender');

const ALL_ACHIEVEMENTS = [
  carrierQualified,
  nightQualified,
  threeWire,
  textbookTrap,
  comebackKid,
  bolterBolter,
  barelyRecovered,
  fleetDefender,
];

module.exports = ALL_ACHIEVEMENTS;
