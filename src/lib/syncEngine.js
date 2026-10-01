/**
 * syncEngine.js — which deals need saving, and what to do when another device got there first.
 *
 * Plain JS (no React) so the two-device cases can be tested directly; useCloudSync wraps it.
 *
 * Change detection: deals are never mutated in place (every edit is a structuredClone),
 * so a deal needs saving exactly when the object in state is not the one we last saved
 * or loaded. That replaces the old "dirty ids, otherwise write everything" approach,
 * whose write-everything path let one device silently overwrite another's edits.
 *
 * Conflicts (BACK-117): each save says which cloud version it was based on
 * (the row's updated_at). If the row has moved on, `save` reports a conflict instead of
 * writing, and the deal is held back until the user keeps theirs or ours.
 */
import * as Sentry from '@sentry/react';

// jsonb returns keys in its own order, so compare deals by content, not by JSON.stringify.
export function sameDealContent(a, b) {
  return stableJson(strip(a)) === stableJson(strip(b));
}

function strip(d) {
  if (!d) return d;
  const { _deal_id, ...rest } = d; // eslint-disable-line no-unused-vars
  return rest;
}

function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * @param {object} deps
 * @param {(deal, dealId, expectedVersion) => Promise<
 *          {status:'saved', dealId, version} |
 *          {status:'conflict', theirs, version}>} deps.save
 *   expectedVersion undefined = no known cloud version (new deal, or cloud never read): plain upsert.
 */
export function createDealSync({ save }) {
  let synced = new Map();    // local id → deal object last saved or loaded
  let versions = new Map();  // deal uuid → cloud updated_at that object was based on
  let ids = new Map();       // local id → deal uuid assigned on first save (before state catches up)
  let conflicts = new Map(); // local id → { theirs, version }
  let queue = Promise.resolve();

  const uuidOf = d => d._deal_id || ids.get(d.id);

  function adopt(deals, cloudVersions = {}) {
    synced = new Map((deals || []).map(d => [d.id, d]));
    versions = new Map(Object.entries(cloudVersions));
    ids = new Map();
    conflicts = new Map();
  }

  function changed(deals) {
    return (deals || []).filter(d => synced.get(d.id) !== d && !conflicts.has(d.id));
  }

  async function push(deals) {
    const pending = changed(deals);
    const results = await Promise.all(pending.map(d => {
      const uuid = uuidOf(d);
      return save(d, uuid, uuid ? versions.get(uuid) : undefined);
    }));
    const newIds = {};
    pending.forEach((d, i) => {
      const r = results[i];
      if (r.status === 'saved') {
        versions.set(r.dealId, r.version);
        synced.set(d.id, d);
        if (!d._deal_id) { ids.set(d.id, r.dealId); newIds[d.id] = r.dealId; }
      } else if (r.theirs && sameDealContent(d, r.theirs)) {
        // Same content already in the cloud (another tab saved the identical edit, or
        // our own earlier save landed but its response was lost) — nothing to ask.
        versions.set(uuidOf(d), r.version);
        synced.set(d.id, d);
      } else {
        conflicts.set(d.id, { theirs: r.theirs, version: r.version });
        Sentry.addBreadcrumb({ category: 'sync', message: 'conflict', data: { deal_id: uuidOf(d), deleted: !r.theirs }, level: 'warning' });
      }
    });
    return { newIds, conflictIds: [...conflicts.keys()] };
  }

  // One push at a time: two overlapping saves of the same deal would carry the same
  // expected version, and the second would report a conflict with ourselves.
  function flush(getDeals) {
    const run = queue.then(() => push(getDeals()));
    queue = run.catch(() => {});
    return run;
  }

  // Put DB-assigned uuids onto new deals. A deal edited while its first save was in
  // flight is a different object — it keeps its pending change and saves (as an update) next.
  function applyNewIds(deals, newIds) {
    return deals.map(d => {
      if (!newIds[d.id] || d._deal_id) return d;
      const withId = { ...d, _deal_id: newIds[d.id] };
      if (synced.get(d.id) === d) synced.set(d.id, withId);
      return withId;
    });
  }

  function listConflicts(deals) {
    return (deals || []).filter(d => conflicts.has(d.id))
      .map(d => ({ id: d.id, mine: d, theirs: conflicts.get(d.id).theirs }));
  }

  // Overwrite the cloud with this device's copy (recreates it if it was deleted elsewhere).
  function keepMine(id, deal) {
    const c = conflicts.get(id);
    if (!c) return;
    const uuid = uuidOf(deal);
    if (c.theirs) versions.set(uuid, c.version); else versions.delete(uuid);
    conflicts.delete(id);
    synced.delete(id);
  }

  // Take the cloud copy. Returns the deal to put in state, or null if it was deleted there.
  function loadTheirs(id, deal) {
    const c = conflicts.get(id);
    if (!c) return deal;
    conflicts.delete(id);
    if (!c.theirs) { synced.delete(id); return null; }
    const uuid = uuidOf(deal);
    const theirs = { ...c.theirs, id, _deal_id: uuid };
    versions.set(uuid, c.version);
    synced.set(id, theirs);
    return theirs;
  }

  function forget(id) { conflicts.delete(id); synced.delete(id); ids.delete(id); }

  return { adopt, changed, flush, applyNewIds, listConflicts, keepMine, loadTheirs, forget };
}
