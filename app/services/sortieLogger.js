'use strict';

const path = require('path');

const SAFE_RE = /[^a-zA-Z0-9_-]/g;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function safeUcid(ucid) {
  return String(ucid).replace(SAFE_RE, '_');
}

class SortieLogger {
  constructor(logsRoot, { fs } = {}) {
    this._fs = fs || require('fs');
    this._logsRoot = logsRoot;
    this._sorties = new Map(); // ucid → { ucidDir, name, filePath|null }
  }

  startSortie(ucid, name) {
    this._closeActive(ucid);
    const ucidDir = path.join(this._logsRoot, safeUcid(ucid));
    this._fs.mkdirSync(ucidDir, { recursive: true });
    const now = new Date();
    const ts = now.toISOString().replace(/:/g, '-').replace(/\./g, '-');
    let filePath = path.join(ucidDir, `${ts}.jsonl`);
    let n = 1;
    while (this._fs.existsSync(filePath)) {
      // Use '_' (sorts after '.') so same-millisecond collisions order *after*
      // the original file. A '-' separator would sort before '.jsonl' and break
      // chronological filename ordering relied on by firstFile()/purge.
      filePath = path.join(ucidDir, `${ts}_${String(n++).padStart(3, '0')}.jsonl`);
    }
    this._writeLine(filePath, { sortie_start: now.toISOString(), ucid, name: name || ucid });
    this._sorties.set(ucid, { ucidDir, name: name || ucid, filePath });
  }

  logSnapshot(ucid, snapshot) {
    const sortie = this._sorties.get(ucid);
    if (!sortie) return;

    this._writeLine(sortie.filePath, {
      t: new Date().toISOString(),
      type: 'flight_sample_enrichment',
      state: snapshot.state,
    });
  }

  endSortie(ucid, reason) {
    const sortie = this._sorties.get(ucid);
    if (!sortie) return;

    if (sortie.filePath) {
      this._writeLine(sortie.filePath, { sortie_end: new Date().toISOString(), reason });
    }

    this._sorties.delete(ucid);
  }

  closeAll() {
    for (const ucid of [...this._sorties.keys()]) {
      this.endSortie(ucid, 'shutdown');
    }
  }

  _closeActive(ucid) {
    if (this._sorties.has(ucid)) {
      this.endSortie(ucid, 'replaced');
    }
  }

  purgeLogs(olderThanMs = RETENTION_MS) {
    const cutoff = Date.now() - olderThanMs;
    let ucidDirs;
    try {
      ucidDirs = this._fs.readdirSync(this._logsRoot, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of ucidDirs) {
      if (!entry.isDirectory()) continue;
      const ucidDir = path.join(this._logsRoot, entry.name);
      let files;
      try {
        files = this._fs.readdirSync(ucidDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.isFile()) continue;
        const filePath = path.join(ucidDir, file.name);
        try {
          const { mtimeMs } = this._fs.statSync(filePath);
          if (mtimeMs < cutoff) this._fs.unlinkSync(filePath);
        } catch {
          // ignore individual file errors
        }
      }
      // remove empty pilot directory
      try {
        const remaining = this._fs.readdirSync(ucidDir);
        if (remaining.length === 0) this._fs.rmdirSync(ucidDir);
      } catch {
        // ignore
      }
    }
  }

  _writeLine(filePath, obj) {
    this._fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
  }
}

module.exports = { SortieLogger };
