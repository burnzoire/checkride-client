const BLUE_AIRCRAFT = [
  {
    unitType: 'F-14A',
    weapons: ['AIM-54A-Mk47', 'AIM-7M', 'AIM-9L']
  },
  {
    unitType: 'F-16C',
    weapons: ['AIM-120C', 'AIM-9X', 'Mk-82', 'GBU-12']
  },
  {
    unitType: 'FA-18C',
    weapons: ['AIM-120C', 'AIM-9X', 'AGM-65E', 'GBU-12', 'Mk-82']
  },
  {
    unitType: 'A-10C',
    weapons: ['GAU-8', 'AGM-65D', 'GBU-12', 'Mk-82']
  }
];

const RED_AIRCRAFT = [
  {
    unitType: 'MiG-29A',
    weapons: ['R-27ER', 'R-73']
  },
  {
    unitType: 'Su-27',
    weapons: ['R-27ER', 'R-73']
  },
  {
    unitType: 'Su-30',
    weapons: ['R-27ER', 'R-77', 'R-73']
  }
];

const AI_AIRCRAFT = ['MiG-29A', 'Su-27', 'Su-30', 'MiG-21Bis'];
const AI_GROUND_UNITS = ['T-72', 'BMP-2', 'ZSU-23-4'];

const AIRDROMES = {
  blue: ['Test Field 1', 'Test Field 2', 'Test Carrier 1'],
  red: ['Test Field Red 1', 'Test Field Red 2']
};

module.exports = {
  BLUE_AIRCRAFT,
  RED_AIRCRAFT,
  AI_AIRCRAFT,
  AI_GROUND_UNITS,
  AIRDROMES
};
