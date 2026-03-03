const createTestEvents = (udpServer, { enabled = true, dcsChatClient } = {}) => [
  {
    label: 'Send test kill event',
    enabled,
    click() {
      udpServer.send({
        type: "kill",
        killerUcid: "test1",
        killerName: "Test Pilot",
        killerUnitType: "F-14A",
        killerSide: "blue",
        victimUcid: "test2",
        victimName: "Test Pilot 2",
        victimUnitType: "JF-17",
        victimSide: "red",
        weaponName: "AIM-9L"
      });
    }
  },
  {
    label: 'Send burst kill events (5 immediate)',
    enabled,
    click() {
      for (let i = 0; i < 5; i += 1) {
        udpServer.send({
          type: "kill",
          killerUcid: "test1",
          killerName: "Test Pilot",
          killerUnitType: "F-14A",
          killerSide: "blue",
          victimUcid: `test-ural-${i + 1}`,
          victimName: `Ural-375 #${i + 1}`,
          victimUnitType: "Ural-375",
          victimSide: "red",
          weaponName: "Mk-84"
        });
      }
    }
  },
  {
    label: 'Send burst kill events (10 immediate)',
    enabled,
    click() {
      for (let i = 0; i < 10; i += 1) {
        udpServer.send({
          type: "kill",
          killerUcid: "test1",
          killerName: "Test Pilot",
          killerUnitType: "F-14A",
          killerSide: "blue",
          victimUcid: `test-ural-${i + 1}`,
          victimName: `Ural-375 #${i + 1}`,
          victimUnitType: "Ural-375",
          victimSide: "red",
          weaponName: "Mk-84"
        });
      }
    }
  },
  {
    label: 'Send test takeoff event (F-14A)',
    enabled,
    click() {
      udpServer.send({
        type: "takeoff",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14A",
        airdromeName: "Test Field"
      });
    }
  },
  {
    label: 'Send test takeoff event (F-14B)',
    enabled,
    click() {
      udpServer.send({
        type: "takeoff",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14B",
        airdromeName: "Test Field"
      });
    }
  },
  {
    label: 'Send test landing event (F-14A)',
    enabled,
    click() {
      udpServer.send({
        type: "landing",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14A",
        airdromeName: "Test Field"
      });
    }
  },
  {
    label: 'Send test landing event (F-14B)',
    enabled,
    click() {
      udpServer.send({
        type: "landing",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14B",
        airdromeName: "Test Field"
      });
    }
  },
  {
    label: 'Send test trap grading event (_OK_, wire 3)',
    enabled,
    click() {
      udpServer.send({
        type: "grading",
        source: "mission",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14B",
        lsoGrade: "_OK_",
        wire: 3,
        night: false,
        gradingRaw: "LSO: GRADE:_OK_ : WIRE# 3",
        carrierName: "CVN-71 Theodore Roosevelt"
      });
    }
  },
  {
    label: 'Send test trap grading event ((OK), wire 1 night)',
    enabled,
    click() {
      udpServer.send({
        type: "grading",
        source: "mission",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14A",
        lsoGrade: "(OK)",
        wire: 1,
        night: true,
        gradingRaw: "LSO: GRADE:(OK) : WIRE# 1",
        carrierName: "CVN-74 John C. Stennis"
      });
    }
  },
  {
    label: 'Send test bolter grading event',
    enabled,
    click() {
      udpServer.send({
        type: "grading",
        source: "mission",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "FA-18C",
        lsoGrade: "B",
        wire: null,
        night: false,
        gradingRaw: "BOLTER",
        carrierName: "CVN-73 George Washington"
      });
    }
  },
  {
    label: 'Send test change slot event',
    enabled,
    click() {
      udpServer.send({
        type: "change_slot",
        playerUcid: "test1",
        playerName: "Test Pilot",
        slotId: "1",
        prevSide: "1",
        flyable: true
      });
    }
  },
  {
    label: 'Send test disconnect event',
    enabled,
    click() {
      udpServer.send({
        type: "disconnect",
        playerUcid: "test1",
        playerName: "Test Pilot",
        playerSide: "1",
        reasonCode: "1"
      });
    }
  },
  {
    label: 'Send test connect event',
    enabled,
    click() {
      udpServer.send({
        type: "connect",
        playerUcid: "test1",
        playerName: "Test Pilot"
      });
    }
  },
  {
    label: 'Send crash event',
    enabled,
    click() {
      udpServer.send({
        type: "crash",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14B",
      });
    }
  },
  {
    label: 'Send eject event',
    enabled,
    click() {
      udpServer.send({
        type: "eject",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14B",
      });
    }
  },
  {
    label: 'Send pilot death event',
    enabled,
    click() {
      udpServer.send({
        type: "pilot_death",
        playerUcid: "test1",
        playerName: "Test Pilot",
        unitType: "F-14B",
      });
    }
  },
  {
    label: 'Send self kill event',
    enabled,
    click() {
      udpServer.send({
        type: "self_kill",
        playerUcid: "test1",
        playerName: "Test Pilot",
      });
    }
  },
  {
    label: 'Send test chat message',
    enabled: enabled && Boolean(dcsChatClient?.send),
    click() {
      if (!dcsChatClient?.send) {
        return;
      }
      dcsChatClient.send('Checkride test chat message', true, { kind: 'test' });
    }
  },


];

module.exports = createTestEvents;
