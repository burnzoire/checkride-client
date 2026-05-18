'use strict';

const path = require('path');

const SAFE_RE = /[^a-zA-Z0-9_-]/g;

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
    this._sorties.set(ucid, { ucidDir, name: name || ucid, filePath: null });
  }

  logSnapshot(ucid, snapshot) {
    const sortie = this._sorties.get(ucid);
    if (!sortie) return;

    const now = new Date();

    if (!sortie.filePath) {
      const ts = now.toISOString().replace(/:/g, '-').replace(/\./g, '-');
      sortie.filePath = path.join(sortie.ucidDir, `${ts}.jsonl`);
      this._writeLine(sortie.filePath, { sortie_start: now.toISOString(), ucid, name: sortie.name });
    }

    this._writeLine(sortie.filePath, {
      t: now.toISOString(),
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

  _writeLine(filePath, obj) {
    this._fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
  }
}

module.exports = { SortieLogger };
