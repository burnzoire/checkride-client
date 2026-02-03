const createTestEvents = require('./testEvents');

describe('testEvents', () => {
  let mockUdpServer;
  let mockDcsChatClient;

  beforeEach(() => {
    mockUdpServer = {
      send: jest.fn(),
    };
    mockDcsChatClient = {
      send: jest.fn(),
    };
  });

  it('should return an array of test event menu items', () => {
    const events = createTestEvents(mockUdpServer);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  it('should include test kill event', () => {
    const events = createTestEvents(mockUdpServer);
    const killEvent = events.find(item => item.label === 'Send test kill event');

    expect(killEvent).toBeDefined();
    expect(typeof killEvent.click).toBe('function');
  });

  it('should send kill event data when kill event is clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const killEvent = events.find(item => item.label === 'Send test kill event');

    killEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kill',
        killerUcid: 'test1',
        killerName: 'Test Pilot',
        killerUnitType: 'F-14A',
        victimUcid: 'test2',
        victimName: 'Test Pilot 2',
        weaponName: 'AIM-9L',
      })
    );
  });

  it('should include test takeoff event for F-14A', () => {
    const events = createTestEvents(mockUdpServer);
    const takeoffEvent = events.find(item => item.label === 'Send test takeoff event (F-14A)');

    expect(takeoffEvent).toBeDefined();
    expect(typeof takeoffEvent.click).toBe('function');
  });

  it('should send takeoff event data when F-14A takeoff is clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const takeoffEvent = events.find(item => item.label === 'Send test takeoff event (F-14A)');

    takeoffEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'takeoff',
        playerUcid: 'test1',
        unitType: 'F-14A',
        airdromeName: 'Test Field',
      })
    );
  });

  it('should include test takeoff event for F-14B', () => {
    const events = createTestEvents(mockUdpServer);
    const takeoffEvent = events.find(item => item.label === 'Send test takeoff event (F-14B)');

    expect(takeoffEvent).toBeDefined();
  });

  it('should send takeoff event data when F-14B takeoff is clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const takeoffEvent = events.find(item => item.label === 'Send test takeoff event (F-14B)');

    takeoffEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'takeoff',
        unitType: 'F-14B',
      })
    );
  });

  it('should include test landing event for F-14A', () => {
    const events = createTestEvents(mockUdpServer);
    const landingEvent = events.find(item => item.label === 'Send test landing event (F-14A)');

    expect(landingEvent).toBeDefined();
  });

  it('should send landing event data when F-14A landing is clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const landingEvent = events.find(item => item.label === 'Send test landing event (F-14A)');

    landingEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'landing',
        unitType: 'F-14A',
      })
    );
  });

  it('should include test landing event for F-14B', () => {
    const events = createTestEvents(mockUdpServer);
    const landingEvent = events.find(item => item.label === 'Send test landing event (F-14B)');

    expect(landingEvent).toBeDefined();
  });

  it('should send landing event data when F-14B landing is clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const landingEvent = events.find(item => item.label === 'Send test landing event (F-14B)');

    landingEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'landing',
        unitType: 'F-14B',
      })
    );
  });

  it('should include test change slot event', () => {
    const events = createTestEvents(mockUdpServer);
    const changeSlotEvent = events.find(item => item.label === 'Send test change slot event');

    expect(changeSlotEvent).toBeDefined();
  });

  it('should send change slot event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const changeSlotEvent = events.find(item => item.label === 'Send test change slot event');

    changeSlotEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'change_slot',
        playerUcid: 'test1',
        slotId: '1',
        flyable: true
      })
    );
  });

  it('should include test disconnect event', () => {
    const events = createTestEvents(mockUdpServer);
    const disconnectEvent = events.find(item => item.label === 'Send test disconnect event');

    expect(disconnectEvent).toBeDefined();
  });

  it('should send disconnect event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const disconnectEvent = events.find(item => item.label === 'Send test disconnect event');

    disconnectEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'disconnect',
        playerUcid: 'test1',
        reasonCode: '1',
      })
    );
  });

  it('should include test connect event', () => {
    const events = createTestEvents(mockUdpServer);
    const connectEvent = events.find(item => item.label === 'Send test connect event');

    expect(connectEvent).toBeDefined();
  });

  it('should send connect event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const connectEvent = events.find(item => item.label === 'Send test connect event');

    connectEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'connect',
        playerUcid: 'test1',
        playerName: 'Test Pilot',
      })
    );
  });

  it('should include crash event', () => {
    const events = createTestEvents(mockUdpServer);
    const crashEvent = events.find(item => item.label === 'Send crash event');

    expect(crashEvent).toBeDefined();
  });

  it('should send crash event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const crashEvent = events.find(item => item.label === 'Send crash event');

    crashEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'crash',
        playerUcid: 'test1',
        unitType: 'F-14B',
      })
    );
  });

  it('should include eject event', () => {
    const events = createTestEvents(mockUdpServer);
    const ejectEvent = events.find(item => item.label === 'Send eject event');

    expect(ejectEvent).toBeDefined();
  });

  it('should send eject event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const ejectEvent = events.find(item => item.label === 'Send eject event');

    ejectEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'eject',
        playerUcid: 'test1',
        unitType: 'F-14B',
      })
    );
  });

  it('should include pilot death event', () => {
    const events = createTestEvents(mockUdpServer);
    const pilotDeathEvent = events.find(item => item.label === 'Send pilot death event');

    expect(pilotDeathEvent).toBeDefined();
  });

  it('should send pilot death event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const pilotDeathEvent = events.find(item => item.label === 'Send pilot death event');

    pilotDeathEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pilot_death',
        playerUcid: 'test1',
        unitType: 'F-14B',
      })
    );
  });

  it('should include self kill event', () => {
    const events = createTestEvents(mockUdpServer);
    const selfKillEvent = events.find(item => item.label === 'Send self kill event');

    expect(selfKillEvent).toBeDefined();
  });

  it('should send self kill event data when clicked', () => {
    const events = createTestEvents(mockUdpServer);
    const selfKillEvent = events.find(item => item.label === 'Send self kill event');

    selfKillEvent.click();

    expect(mockUdpServer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'self_kill',
        playerUcid: 'test1',
      })
    );
  });

  it('should have all menu items with click functions', () => {
    const events = createTestEvents(mockUdpServer, { dcsChatClient: mockDcsChatClient });

    events.forEach(event => {
      expect(event).toHaveProperty('label');
      expect(event).toHaveProperty('click');
      expect(typeof event.click).toBe('function');
    });
  });

  it('should include test chat message', () => {
    const events = createTestEvents(mockUdpServer, { dcsChatClient: mockDcsChatClient });
    const chatEvent = events.find(item => item.label === 'Send test chat message');

    expect(chatEvent).toBeDefined();
    expect(chatEvent.enabled).toBe(true);
  });

  it('should send chat message when clicked', () => {
    const events = createTestEvents(mockUdpServer, { dcsChatClient: mockDcsChatClient });
    const chatEvent = events.find(item => item.label === 'Send test chat message');

    chatEvent.click();

    expect(mockDcsChatClient.send).toHaveBeenCalledWith('Checkride test chat message', true, { kind: 'test' });
  });
});
