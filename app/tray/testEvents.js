const createTestEvents = (udpServer) => [
  {
    label: 'Send test kill event',
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
    label: 'Send test takeoff event (F-14A)',
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
    label: 'Send test change slot event',
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
    click() {
      udpServer.send({
        type: "self_kill",
        playerUcid: "test1",
        playerName: "Test Pilot",
      });
    }
  },


];

module.exports = createTestEvents;
