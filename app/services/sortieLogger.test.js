'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { SortieLogger } = require('./sortieLogger');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sortie-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(l => l)
    .map(l => JSON.parse(l));
}

function firstFile(ucidDir) {
  const files = fs.readdirSync(ucidDir).sort();
  return path.join(ucidDir, files[0]);
}

test('logSnapshot without startSortie is a no-op', () => {
  const logger = new SortieLogger(tmpDir);
  expect(() => logger.logSnapshot('ucid1', { state: { telemetry: {} } })).not.toThrow();
  expect(fs.readdirSync(tmpDir)).toHaveLength(0);
});

test('startSortie creates the ucid directory', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  expect(fs.existsSync(path.join(tmpDir, 'ucid1'))).toBe(true);
});

test('logSnapshot creates a .jsonl file on first call', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: { telemetry: { speedKts: 300 } } });

  const files = fs.readdirSync(path.join(tmpDir, 'ucid1'));
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/\.jsonl$/);
});

test('filename is an ISO-derived timestamp', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: {} });

  const files = fs.readdirSync(path.join(tmpDir, 'ucid1'));
  expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
});

test('first line is the sortie_start header', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: {} });

  const lines = readLines(firstFile(path.join(tmpDir, 'ucid1')));
  expect(lines[0].sortie_start).toBeTruthy();
  expect(lines[0].ucid).toBe('ucid1');
  expect(lines[0].name).toBe('Maverick');
});

test('multiple logSnapshot calls append to the same file', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: { telemetry: { speedKts: 100 } } });
  logger.logSnapshot('ucid1', { state: { telemetry: { speedKts: 200 } } });
  logger.logSnapshot('ucid1', { state: { telemetry: { speedKts: 300 } } });

  const files = fs.readdirSync(path.join(tmpDir, 'ucid1'));
  expect(files).toHaveLength(1);

  const lines = readLines(path.join(tmpDir, 'ucid1', files[0]));
  expect(lines).toHaveLength(4); // header + 3 samples
  expect(lines[1].type).toBe('flight_sample_enrichment');
  expect(lines[3].state.telemetry.speedKts).toBe(300);
});

test('endSortie appends a sortie_end record', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: {} });
  logger.endSortie('ucid1', 'land');

  const lines = readLines(firstFile(path.join(tmpDir, 'ucid1')));
  const last = lines[lines.length - 1];
  expect(last.sortie_end).toBeTruthy();
  expect(last.reason).toBe('land');
});

test('endSortie with no file written is silent (pilot never flew)', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  expect(() => logger.endSortie('ucid1', 'disconnect')).not.toThrow();
  expect(fs.readdirSync(path.join(tmpDir, 'ucid1'))).toHaveLength(0);
});

test('endSortie on unknown ucid is a no-op', () => {
  const logger = new SortieLogger(tmpDir);
  expect(() => logger.endSortie('nobody', 'land')).not.toThrow();
});

test('startSortie called twice closes the first sortie', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: {} });
  logger.startSortie('ucid1', 'Maverick'); // second slot — no snapshot taken yet

  // Only the first sortie's file exists; the second has no file until a snapshot is taken
  const files = fs.readdirSync(path.join(tmpDir, 'ucid1'));
  expect(files).toHaveLength(1);

  const lines = readLines(path.join(tmpDir, 'ucid1', files[0]));
  expect(lines[lines.length - 1].reason).toBe('replaced');
});

test('closeAll ends all active sorties with reason shutdown', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.startSortie('ucid2', 'Goose');
  logger.logSnapshot('ucid1', { state: {} });
  logger.logSnapshot('ucid2', { state: {} });
  logger.closeAll();

  for (const ucid of ['ucid1', 'ucid2']) {
    const lines = readLines(firstFile(path.join(tmpDir, ucid)));
    expect(lines[lines.length - 1].reason).toBe('shutdown');
  }
});

test('closeAll is idempotent', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid1', 'Maverick');
  logger.logSnapshot('ucid1', { state: {} });
  logger.closeAll();
  expect(() => logger.closeAll()).not.toThrow();
});

test('UCID with special characters is sanitized to safe directory name', () => {
  const logger = new SortieLogger(tmpDir);
  logger.startSortie('ucid/with:special*chars', 'Pilot');
  logger.logSnapshot('ucid/with:special*chars', { state: {} });

  expect(fs.existsSync(path.join(tmpDir, 'ucid_with_special_chars'))).toBe(true);
});

describe('purgeLogs', () => {
  test('deletes files older than the cutoff', () => {
    const logger = new SortieLogger(tmpDir);
    logger.startSortie('ucid1', 'Maverick');
    logger.logSnapshot('ucid1', { state: {} });
    logger.closeAll();

    const ucidDir = path.join(tmpDir, 'ucid1');
    const [file] = fs.readdirSync(ucidDir);
    const filePath = path.join(ucidDir, file);

    // backdate mtime to 8 days ago
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(filePath, old, old);

    logger.purgeLogs(7 * 24 * 60 * 60 * 1000);

    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(ucidDir)).toBe(false); // empty dir removed too
  });

  test('keeps files newer than the cutoff', () => {
    const logger = new SortieLogger(tmpDir);
    logger.startSortie('ucid1', 'Maverick');
    logger.logSnapshot('ucid1', { state: {} });
    logger.closeAll();

    const ucidDir = path.join(tmpDir, 'ucid1');
    const [file] = fs.readdirSync(ucidDir);

    logger.purgeLogs(7 * 24 * 60 * 60 * 1000);

    expect(fs.existsSync(path.join(ucidDir, file))).toBe(true);
  });

  test('only removes old files, leaves recent ones and keeps the directory', () => {
    const logger = new SortieLogger(tmpDir);
    logger.startSortie('ucid1', 'Maverick');
    logger.logSnapshot('ucid1', { state: {} });
    logger.endSortie('ucid1', 'land');
    // start a second sortie to get a second file
    logger.startSortie('ucid1', 'Maverick');
    logger.logSnapshot('ucid1', { state: {} });
    logger.closeAll();

    const ucidDir = path.join(tmpDir, 'ucid1');
    const files = fs.readdirSync(ucidDir).sort();
    expect(files).toHaveLength(2);

    // backdate only the first file
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(ucidDir, files[0]), old, old);

    logger.purgeLogs(7 * 24 * 60 * 60 * 1000);

    const remaining = fs.readdirSync(ucidDir);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(files[1]);
    expect(fs.existsSync(ucidDir)).toBe(true); // dir still has files
  });

  test('is a no-op when logs directory does not exist', () => {
    const logger = new SortieLogger(path.join(tmpDir, 'nonexistent'));
    expect(() => logger.purgeLogs()).not.toThrow();
  });
});
