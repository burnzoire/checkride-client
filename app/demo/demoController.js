const dgram = require('dgram');
const log = require('electron-log');

const {
  BLUE_AIRCRAFT,
  RED_AIRCRAFT,
  AI_AIRCRAFT,
  AI_GROUND_UNITS,
  AIRDROMES
} = require('./catalog');

const { createSeededRandom } = require('./random');

const DEFAULT_TARGET_HOST = '127.0.0.1';
const DEFAULT_TARGET_PORT = 41234;

const DEMO_PILOT_NAMES = [
  'Maverick',
  'Iceman',
  'Goose',
  'Viper',
  'Jester',
  'Merlin',
  'Hollywood',
  'Wolfman',
  'Slider',
  'Stinger',
  'Cougar',
  'Charlie',
  'Sundown',
  'Chipper',
  'Mongoose',
  'Rooster',
  'Phoenix',
  'Bob',
  'Hangman',
  'Warlock'
];

function slugifyPilotName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

class DemoController {
  constructor({
    targetHost = DEFAULT_TARGET_HOST,
    targetPort = DEFAULT_TARGET_PORT,
    pilotCount = 20,
    seed = 'checkride-demo',
    minDelayMs = 1200,
    maxDelayMs = 5500,
    minInterEventDelayMs = 180,
    maxInterEventDelayMs = 650
  } = {}) {
    this.targetHost = targetHost;
    this.targetPort = Number(targetPort);
    this.pilotCount = pilotCount;
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.minInterEventDelayMs = minInterEventDelayMs;
    this.maxInterEventDelayMs = maxInterEventDelayMs;

    this.random = createSeededRandom(seed);

    this._running = false;
    this._timers = new Set();
    this._emitter = null;
    this._server = null;
  }

  get isRunning() {
    return this._running;
  }

  start() {
    if (this._running) {
      return;
    }

    if (!Number.isFinite(this.targetPort) || this.targetPort <= 0) {
      throw new Error('Invalid targetPort');
    }

    this._running = true;

    this._emitter = dgram.createSocket('udp4');
    // bind to an ephemeral port so the receiver sees a realistic source port
    this._emitter.bind(0);

    this._server = buildServerSession({
      pilotCount: this.pilotCount,
      random: this.random
    });

    this._scheduleServerTick(this._server);

    log.info(`Demo mode started (1 server, ${this.pilotCount} pilots)`);
  }

  stop() {
    if (!this._running) {
      return;
    }

    this._running = false;

    for (const timer of this._timers) {
      clearTimeout(timer);
    }
    this._timers.clear();

    if (this._emitter) {
      try {
        this._emitter.close();
      } catch (e) {
        // ignore
      }
    }

    this._emitter = null;
    this._server = null;

    log.info('Demo mode stopped');
  }

  _scheduleServerTick(serverSession) {
    if (!this._running) {
      return;
    }

    const delayMs = this.random.int(this.minDelayMs, this.maxDelayMs);

    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (!this._running) {
        return;
      }

      try {
        const events = serverSession.generateEvents();
        this._scheduleEvents(serverSession.serverIndex, events);
      } catch (err) {
        log.error(err);
      }

      this._scheduleServerTick(serverSession);
    }, delayMs);

    this._timers.add(timer);
  }

  _scheduleEvents(serverIndex, events) {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    let cumulativeDelay = 0;
    for (const event of events) {
      const interDelay = this.random.int(this.minInterEventDelayMs, this.maxInterEventDelayMs);
      cumulativeDelay += interDelay;

      const sendTimer = setTimeout(() => {
        this._timers.delete(sendTimer);
        if (!this._running) {
          return;
        }
        this._send(serverIndex, event);
      }, cumulativeDelay);

      this._timers.add(sendTimer);
    }
  }

  _send(serverIndex, event) {
    // serverIndex is kept in the signature for minimal churn,
    // but demo mode now emits from a single simulated server.
    const socket = this._emitter;
    if (!socket) {
      return;
    }

    const msg = Buffer.from(`${JSON.stringify(event)} \n`);

    socket.send(msg, this.targetPort, this.targetHost, (err) => {
      if (err) {
        log.error(err);
      }
    });
  }
}

function buildServerSession({ pilotCount, random }) {
  const serverIndex = 0;

  const count = Math.min(Number(pilotCount) || 0, DEMO_PILOT_NAMES.length);
  const pilots = Array.from({ length: count }, (_unused, i) => {
    return createPilot({ index: i + 1, random, serverIndex });
  });

  return new ServerSession({ serverIndex, pilots, random });
}

function createPilot({ index, random, serverIndex }) {
  const rosterIndex = (index - 1) % DEMO_PILOT_NAMES.length;
  const name = DEMO_PILOT_NAMES[rosterIndex];
  const ucid = `demo-pilot-${slugifyPilotName(name)}`;

  return {
    ucid,
    name,
    serverIndex,
    connected: false,
    flyable: false,
    slotId: null,
    unitType: null,
    inAir: false,
    side: random.chance(0.85) ? 'blue' : 'red',
    pendingDeath: false,
    airborneSinceMs: null,
    plannedLandingAtMs: null
  };
}

class ServerSession {
  constructor({ serverIndex, pilots, random }) {
    this.serverIndex = serverIndex;
    this.pilots = pilots;
    this.random = random;
  }

  generateEvents() {
    const events = [];

    // Occasionally bring new pilots online to “grow the dataset”.
    const disconnected = this.pilots.filter(p => !p.connected);
    if (disconnected.length > 0 && this.random.chance(0.35)) {
      const pilot = this.random.pick(disconnected);
      events.push(buildConnectEvent(pilot));
      pilot.connected = true;

      // almost always pick a flyable slot right after connect
      if (this.random.chance(0.9)) {
        events.push(...this._changeToFlyableSlot(pilot));
      } else {
        events.push(buildChangeSlotEvent(pilot, { slotId: 'spectator', prevSide: null, flyable: false }));
        pilot.flyable = false;
        pilot.slotId = 'spectator';
        pilot.unitType = null;
      }

      return events;
    }

    // Generate 1-3 “normal” events
    const eventCount = this.random.int(1, 3);
    for (let i = 0; i < eventCount; i += 1) {
      const pilot = this.random.pick(this.pilots);
      const next = this._generatePilotEvent(pilot);
      if (next.length) {
        events.push(...next);
      }
    }

    return events;
  }

  _generatePilotEvent(pilot) {
    if (!pilot.connected) {
      return [];
    }

    const nowMs = Date.now();

    // If pilot died/ejected, follow up with crash sometimes.
    if (pilot.pendingDeath) {
      pilot.pendingDeath = false;
      pilot.inAir = false;
      pilot.airborneSinceMs = null;
      pilot.plannedLandingAtMs = null;

      if (this.random.chance(0.75) && pilot.unitType) {
        return [buildPilotEvent('crash', pilot)];
      }

      return [];
    }

    // Disconnect occasionally
    if (!pilot.inAir && this.random.chance(0.02)) {
      const event = buildDisconnectEvent(pilot);
      pilot.connected = false;
      pilot.flyable = false;
      pilot.slotId = null;
      pilot.unitType = null;
      pilot.inAir = false;
      pilot.airborneSinceMs = null;
      pilot.plannedLandingAtMs = null;
      return [event];
    }

    // Ensure flyable slot before anything meaningful
    if (!pilot.flyable || !pilot.unitType) {
      if (this.random.chance(0.7)) {
        return this._changeToFlyableSlot(pilot);
      }
      return [];
    }

    // Takeoff / Landing
    if (!pilot.inAir && this.random.chance(0.55)) {
      pilot.inAir = true;
      pilot.airborneSinceMs = nowMs;
      pilot.plannedLandingAtMs = nowMs + (this.random.int(5 * 60, 90 * 60) * 1000);
      return [buildAirfieldEvent('takeoff', pilot, this.random)];
    }

    if (pilot.inAir && Number.isFinite(pilot.plannedLandingAtMs) && nowMs >= pilot.plannedLandingAtMs) {
      pilot.inAir = false;
      pilot.airborneSinceMs = null;
      pilot.plannedLandingAtMs = null;
      return [buildAirfieldEvent('landing', pilot, this.random)];
    }

    // Combat events while airborne
    if (pilot.inAir && this.random.chance(0.45)) {
      return this._generateKillSequence(pilot);
    }

    // Mishaps
    if (pilot.inAir && this.random.chance(0.05)) {
      pilot.pendingDeath = true;
      return [buildPilotEvent('eject', pilot)];
    }

    if (pilot.inAir && this.random.chance(0.03)) {
      pilot.pendingDeath = true;
      return [buildPilotEvent('pilot_death', pilot)];
    }

    if (!pilot.inAir && this.random.chance(0.01)) {
      return [buildSelfKillEvent(pilot)];
    }

    // Occasionally swap to a new aircraft, but only via change_slot
    if (!pilot.inAir && this.random.chance(0.06)) {
      return this._changeToFlyableSlot(pilot, { forceChange: true });
    }

    return [];
  }

  _changeToFlyableSlot(pilot, { forceChange = false } = {}) {
    const catalog = pilot.side === 'red' ? RED_AIRCRAFT : BLUE_AIRCRAFT;

    let nextAircraft = this.random.pick(catalog);
    if (!forceChange) {
      // bias toward keeping current aircraft if already set
      if (pilot.unitType && this.random.chance(0.75)) {
        nextAircraft = catalog.find(a => a.unitType === pilot.unitType) || nextAircraft;
      }
    } else {
      const alternatives = catalog.filter(a => a.unitType !== pilot.unitType);
      if (alternatives.length) {
        nextAircraft = this.random.pick(alternatives);
      }
    }

    const prevSide = pilot.slotId ? pilot.side : null;
    const slotId = `${pilot.side}:${nextAircraft.unitType}:${this.random.int(1, 24)}`;

    pilot.flyable = true;
    pilot.slotId = slotId;
    pilot.unitType = nextAircraft.unitType;

    return [buildChangeSlotEvent(pilot, { slotId, prevSide, flyable: true })];
  }

  _generateKillSequence(pilot) {
    const events = [];
    const weapon = pickWeaponForPilot(pilot, this.random);

    // 70%: pilot kills AI, 15%: AI kills pilot, 15%: PvP (pilot vs pilot)
    const roll = this.random.next();

    if (roll < 0.7) {
      const victimIsGround = this.random.chance(0.35);
      const victimUnitType = victimIsGround ? this.random.pick(AI_GROUND_UNITS) : this.random.pick(AI_AIRCRAFT);

      events.push(buildKillEvent({
        killerUcid: pilot.ucid,
        killerName: pilot.name,
        killerUnitType: pilot.unitType,
        killerSide: pilot.side,
        victimUcid: '',
        victimName: 'AI',
        victimUnitType,
        victimSide: pilot.side === 'blue' ? 'red' : 'blue',
        weaponName: weapon
      }));

      return events;
    }

    if (roll < 0.85) {
      // AI kills pilot
      const aiUnitType = this.random.pick(AI_AIRCRAFT);
      const aiWeapon = pilot.side === 'blue' ? this.random.pick(['R-27ER', 'R-73', 'R-77']) : this.random.pick(['AIM-120C', 'AIM-7M', 'AIM-9X']);

      events.push(buildKillEvent({
        killerUcid: '',
        killerName: 'AI',
        killerUnitType: aiUnitType,
        killerSide: pilot.side === 'blue' ? 'red' : 'blue',
        victimUcid: pilot.ucid,
        victimName: pilot.name,
        victimUnitType: pilot.unitType,
        victimSide: pilot.side,
        weaponName: aiWeapon
      }));

      pilot.pendingDeath = true;
      return events;
    }

    // PvP: pick another connected, airborne pilot (prefer opposite side)
    const candidates = this.pilots.filter(p => p.connected && p.inAir && p.ucid !== pilot.ucid);
    if (candidates.length === 0) {
      return [];
    }

    const preferred = candidates.filter(p => p.side !== pilot.side);
    const victim = preferred.length ? this.random.pick(preferred) : this.random.pick(candidates);

    events.push(buildKillEvent({
      killerUcid: pilot.ucid,
      killerName: pilot.name,
      killerUnitType: pilot.unitType,
      killerSide: pilot.side,
      victimUcid: victim.ucid,
      victimName: victim.name,
      victimUnitType: victim.unitType,
      victimSide: victim.side,
      weaponName: weapon
    }));

    victim.pendingDeath = true;
    return events;
  }
}

function pickWeaponForPilot(pilot, random) {
  const catalog = pilot.side === 'red' ? RED_AIRCRAFT : BLUE_AIRCRAFT;
  const aircraft = catalog.find(a => a.unitType === pilot.unitType);
  if (!aircraft) {
    return random.pick(['AIM-9L', 'AIM-120C', 'R-27ER']);
  }
  return random.pick(aircraft.weapons);
}

function buildConnectEvent(pilot) {
  return {
    type: 'connect',
    playerUcid: pilot.ucid,
    playerName: pilot.name
  };
}

function buildDisconnectEvent(pilot) {
  return {
    type: 'disconnect',
    playerUcid: pilot.ucid,
    playerName: pilot.name,
    playerSide: pilot.side,
    reasonCode: 'demo'
  };
}

function buildChangeSlotEvent(pilot, { slotId, prevSide, flyable }) {
  return {
    type: 'change_slot',
    playerUcid: pilot.ucid,
    playerName: pilot.name,
    slotId,
    prevSide,
    flyable
  };
}

function buildAirfieldEvent(type, pilot, random) {
  const airdromes = pilot.side === 'red' ? AIRDROMES.red : AIRDROMES.blue;
  const airdromeName = airdromes.length ? random.pick(airdromes) : 'Test Field';

  return {
    type,
    playerUcid: pilot.ucid,
    playerName: pilot.name,
    unitType: pilot.unitType,
    airdromeName
  };
}

function buildPilotEvent(type, pilot) {
  return {
    type,
    playerUcid: pilot.ucid,
    playerName: pilot.name,
    unitType: pilot.unitType
  };
}

function buildSelfKillEvent(pilot) {
  return {
    type: 'self_kill',
    playerUcid: pilot.ucid,
    playerName: pilot.name
  };
}

function buildKillEvent({
  killerUcid,
  killerName,
  killerUnitType,
  killerSide,
  victimUcid,
  victimName,
  victimUnitType,
  victimSide,
  weaponName
}) {
  return {
    type: 'kill',
    killerUcid,
    killerName,
    killerUnitType,
    killerSide,
    victimUcid,
    victimName,
    victimUnitType,
    victimSide,
    weaponName
  };
}

module.exports = {
  DemoController,
  DEFAULT_TARGET_HOST,
  DEFAULT_TARGET_PORT
};
