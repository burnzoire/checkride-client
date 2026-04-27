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
const basketCase = require('./basketCase');
const boomShakalaka = require('./boomShakalaka');
const topUp = require('./topUp');
const nightTanker = require('./nightTanker');
const transferComplete = require('./transferComplete');
const specialDelivery = require('./specialDelivery');
const soHighRightNow = require('./soHighRightNow');
const iFeelTheNeed = require('./iFeelTheNeed');
const speedIsLife = require('./speedIsLife');
const defeated = require('./defeated');
const wanted = require('./wanted');
const heyManNiceShot = require('./heyManNiceShot');
const slapshot = require('./slapshot');

const ALL_ACHIEVEMENTS = [
  carrierQualified,
  nightQualified,
  threeWire,
  textbookTrap,
  comebackKid,
  bolterBolter,
  barelyRecovered,
  fleetDefender,
  basketCase,
  boomShakalaka,
  topUp,
  nightTanker,
  transferComplete,
  specialDelivery,
  soHighRightNow,
  iFeelTheNeed,
  speedIsLife,
  defeated,
  wanted,
  heyManNiceShot,
  slapshot,
];

module.exports = ALL_ACHIEVEMENTS;
