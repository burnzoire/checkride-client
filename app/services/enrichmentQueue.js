// A symmetric rendezvous between a persisted event (from the GameGUI environment,
// which has the reliable net.* identity) and its mission-environment enrichment
// (persist=false, which carries DCS-sourced taxonomy the GameGUI can't see). The two
// arrive as separate, unordered UDP events; whichever lands first waits for the other.
// The persisted event is released — and only then sent — the moment its enrichment
// arrives, or after a short deadline if none does. Nothing is ever dropped.
//
// This is the shared core behind KillEventQueue and the takeoff/landing queues. Callers
// supply the event-specific bits (key, discriminator, metadata mapping, immediate-send
// rule, post-fold hook); the buffering, matching, deadline and TTL are common.

const DEFAULT_DEADLINE_MS = 2000;
const DEFAULT_ENRICHMENT_TTL_MS = 15000;

function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

class EnrichmentQueue {
  constructor({
    deadlineMs = DEFAULT_DEADLINE_MS,
    enrichmentTtlMs = DEFAULT_ENRICHMENT_TTL_MS,
    // Only enrichments of this type are accepted (others ignored). Null = accept any.
    enrichmentType = null,
    // (event) => rendezvous key. Must agree for a persisted event and its enrichment.
    keyOf,
    // (enrichment) => metadata object folded onto the persisted event, or null.
    metadataFrom = () => null,
    // Secondary match within a key (e.g. victim type), so concurrent events pair up
    // correctly; null on both sides → plain FIFO.
    submitDiscriminatorOf = () => null,
    enrichmentDiscriminatorOf = () => null,
    // (enrichment) => extra fields stashed on the entry for the onFold hook.
    entryExtras = () => ({}),
    // (event) => true to skip the rendezvous entirely (no enrichment will come).
    shouldSendImmediately = () => false,
    // (event, entry|null) => void, run after the metadata fold (entry null on a deadline
    // or immediate send). Lets a caller do extra work with the paired enrichment's data.
    onFold = () => {},
    now = () => Date.now(),
    schedule,
    cancel,
  } = {}) {
    this._deadlineMs = deadlineMs;
    this._enrichmentTtlMs = enrichmentTtlMs;
    this._enrichmentType = enrichmentType;
    this._keyOf = keyOf;
    this._metadataFrom = metadataFrom;
    this._submitDiscriminatorOf = submitDiscriminatorOf;
    this._enrichmentDiscriminatorOf = enrichmentDiscriminatorOf;
    this._entryExtras = entryExtras;
    this._shouldSendImmediately = shouldSendImmediately;
    this._onFold = onFold;
    this._now = now;
    this._schedule = schedule || ((fn, ms) => setTimeout(fn, ms));
    this._cancel = cancel || ((handle) => clearTimeout(handle));
    this._enrichments = new Map(); // key -> [{ metadata, discriminator, extras, recordedAt }]
    this._pending = new Map(); // key -> [{ event, release, resolve, timer, discriminator }]
  }

  // Buffer an enrichment, or release a persisted event already waiting for it.
  recordEnrichment(event) {
    if (!event) return;
    if (this._enrichmentType && event.type !== this._enrichmentType) return;

    const key = this._keyOf(event);
    if (key == null || key === '') return;

    this._pruneEnrichments();

    const entry = {
      metadata: this._metadataFrom(event),
      discriminator: this._enrichmentDiscriminatorOf(event),
      extras: this._entryExtras(event),
      recordedAt: this._now(),
    };

    const pending = this._takePending(key, entry.discriminator);
    if (pending) {
      this._cancel(pending.timer);
      pending.resolve(this._send(pending.event, pending.release, entry.metadata, entry));
      return;
    }

    const list = this._enrichments.get(key) || [];
    list.push(entry);
    this._enrichments.set(key, list);
  }

  // Submit a persisted event for sending. `release` runs the actual send pipeline and
  // is invoked exactly once. Returns a promise that resolves when it is sent (now, on
  // enrichment arrival, or on the deadline).
  submit(event, release) {
    if (this._shouldSendImmediately(event)) {
      return this._send(event, release, null, null);
    }

    const key = this._keyOf(event);
    // No key → can never be matched to an enrichment; holding would only delay it.
    if (key == null || key === '') {
      return this._send(event, release, null, null);
    }

    this._pruneEnrichments();

    const entry = this._takeEnrichment(key, this._submitDiscriminatorOf(event));
    if (entry) {
      return this._send(event, release, entry.metadata, entry);
    }

    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    const pending = { event, release, resolve, timer: null, discriminator: this._submitDiscriminatorOf(event) };
    pending.timer = this._schedule(() => {
      this._removePending(key, pending);
      pending.resolve(this._send(event, release, null, null)); // deadline: send without enrichment
    }, this._deadlineMs);

    const list = this._pending.get(key) || [];
    list.push(pending);
    this._pending.set(key, list);
    return promise;
  }

  _send(event, release, metadata, entry) {
    if (metadata) {
      event.metadata = { ...(event.metadata || {}), ...metadata };
    }
    // onFold (e.g. weapon attribution) is best-effort enrichment — a throw must never
    // block the send, or the event would be lost / the pipeline could stall.
    try {
      this._onFold(event, entry);
    } catch (err) {
      // Swallow: the event still goes out with whatever metadata it already has.
    }
    return release();
  }

  // Prefer a discriminator match, else oldest (FIFO) so concurrent events drain in order.
  _takeEnrichment(key, discriminator) {
    const list = this._enrichments.get(key);
    if (!list || list.length === 0) return null;

    let index = discriminator != null ? list.findIndex((e) => e.discriminator === discriminator) : -1;
    if (index === -1) index = 0;

    const [entry] = list.splice(index, 1);
    if (list.length === 0) this._enrichments.delete(key);
    return entry;
  }

  _takePending(key, discriminator) {
    const list = this._pending.get(key);
    if (!list || list.length === 0) return null;

    let index = discriminator != null ? list.findIndex((p) => p.discriminator === discriminator) : -1;
    if (index === -1) index = 0;

    const [pending] = list.splice(index, 1);
    if (list.length === 0) this._pending.delete(key);
    return pending;
  }

  _removePending(key, pending) {
    const list = this._pending.get(key);
    if (!list) return;

    const index = list.indexOf(pending);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) this._pending.delete(key);
  }

  _pruneEnrichments() {
    const cutoff = this._now() - this._enrichmentTtlMs;
    for (const [key, list] of this._enrichments) {
      const kept = list.filter((entry) => entry.recordedAt >= cutoff);
      if (kept.length > 0) this._enrichments.set(key, kept);
      else this._enrichments.delete(key);
    }
  }
}

module.exports = { EnrichmentQueue, compact, DEFAULT_DEADLINE_MS, DEFAULT_ENRICHMENT_TTL_MS };
