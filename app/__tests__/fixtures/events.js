// Test fixtures for event data

module.exports = {
  killEvent: {
    type: "kill",
    killerUcid: "killer123",
    killerName: "Top Gun",
    killerUnitType: "F-14B",
    killerUnitCategory: "Fixed-wing",
    victimUcid: "victim456",
    victimName: "Enemy Pilot",
    victimUnitType: "MiG-29",
    victimUnitCategory: "Fixed-wing",
    weaponName: "AIM-9M"
  },

  takeoffEvent: {
    type: "takeoff",
    playerUcid: "player123",
    playerName: "Test Pilot",
    unitType: "F-16C",
    unitCategory: "Fixed-wing",
    airdromeName: "Nellis AFB"
  },

  landingEvent: {
    type: "landing",
    playerUcid: "player123",
    playerName: "Test Pilot",
    unitType: "F-16C",
    unitCategory: "Fixed-wing",
    airdromeName: "Nellis AFB"
  },

  crashEvent: {
    type: "crash",
    playerUcid: "player123",
    playerName: "Test Pilot",
    unitType: "F-16C",
    unitCategory: "Fixed-wing"
  },

  ejectEvent: {
    type: "eject",
    playerUcid: "player123",
    playerName: "Test Pilot",
    unitType: "F-16C",
    unitCategory: "Fixed-wing"
  },

  pilotDeathEvent: {
    type: "pilot_death",
    playerUcid: "player123",
    playerName: "Test Pilot",
    unitType: "F-16C",
    unitCategory: "Fixed-wing"
  },

  selfKillEvent: {
    type: "self_kill",
    playerUcid: "player123",
    playerName: "Test Pilot"
  },

  connectEvent: {
    type: "connect",
    playerUcid: "player123",
    playerName: "Test Pilot"
  },

  disconnectEvent: {
    type: "disconnect",
    playerUcid: "player123",
    playerName: "Test Pilot",
    playerSide: "1",
    reasonCode: "1"
  },

  changeSlotEvent: {
    type: "change_slot",
    playerUcid: "player123",
    playerName: "Test Pilot",
    slotId: "5",
    prevSide: "1"
  },

  expectedGameEvent: {
    kill: {
      event_type: "kill",
      event: {
        killer_ucid: "killer123",
        killer_name: "Top Gun",
        killer_unit_name: "F-14B",
        killer_unit_category: "Fixed-wing",
        victim_ucid: "victim456",
        victim_name: "Enemy Pilot",
        victim_unit_name: "MiG-29",
        victim_unit_category: "Fixed-wing",
        weapon_name: "AIM-9M"
      }
    },

    takeoff: {
      event_type: "takeoff",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        unit_type: "F-16C",
        unit_category: "Fixed-wing",
        airdrome_name: "Nellis AFB"
      }
    },

    landing: {
      event_type: "landing",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        unit_type: "F-16C",
        unit_category: "Fixed-wing",
        airdrome_name: "Nellis AFB"
      }
    },

    crash: {
      event_type: "crash",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        unit_type: "F-16C",
        unit_category: "Fixed-wing"
      }
    },

    eject: {
      event_type: "eject",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        unit_type: "F-16C",
        unit_category: "Fixed-wing"
      }
    },

    pilotDeath: {
      event_type: "pilot_death",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        unit_type: "F-16C",
        unit_category: "Fixed-wing"
      }
    },

    selfKill: {
      event_type: "self_kill",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot"
      }
    },

    connect: {
      event_type: "connect",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot"
      }
    },

    disconnect: {
      event_type: "disconnect",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        player_side: "1",
        reason_code: "1"
      }
    },

    changeSlot: {
      event_type: "change_slot",
      event: {
        player_ucid: "player123",
        player_name: "Test Pilot",
        slot_id: "5",
        prev_side: "1"
      }
    }
  }
};
