import { describe, test, expect, vi, beforeEach } from 'vitest';

// BACK-117 — two devices editing the same deals must never lose a save silently.
// Part 1 runs the real sync engine on two "devices" against an in-memory server that
// behaves like sbSaveDeal (update only if the row is still at the expected version).
// Part 2 checks sbSaveDeal builds those queries against Supabase.

globalThis.__results = [];
globalThis.__queries = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table) => {
      const entry = { table, calls: [] };
      globalThis.__queries.push(entry);
      const next = () => Promise.resolve(globalThis.__results.shift() ?? { data: null, error: null });
      const q = {};
      ['select', 'update', 'upsert', 'eq'].forEach(m => { q[m] = (...a) => { entry.calls.push([m, ...a]); return q; }; });
      ['single', 'maybeSingle'].forEach(m => { q[m] = () => { entry.calls.push([m]); return next(); }; });
      q.then = (res, rej) => next().then(res, rej);
      return q;
    },
  }),
}));
vi.mock('@sentry/react', () => ({ addBreadcrumb: () => {}, captureMessage: () => {}, captureException: () => {} }));

const { createDealSync, sameDealContent } = await import('../syncEngine.js');
const { sbSaveDeal } = await import('../constants.js');

// ─── In-memory server ─────────────────────────────────────────────────────────
function fakeServer() {
  const rows = new Map();
  const calls = [];
  let clock = 0, nextId = 1;
  const stamp = () => `2026-10-01T00:00:00.${String(++clock).padStart(6, '0')}+00:00`;
  return {
    rows, calls,
    seed(deal) {
      const id = `uuid-${nextId++}`;
      rows.set(id, { data: structuredClone({ ...deal, _deal_id: id }), version: stamp() });
      return id;
    },
    read() {
      const deals = [...rows.entries()].map(([id, r]) => ({ ...structuredClone(r.data), _deal_id: id }));
      const versions = Object.fromEntries([...rows.entries()].map(([id, r]) => [id, r.version]));
      return { deals, versions };
    },
    async save(deal, dealId, expected) {
      calls.push({ id: deal.id, dealId, expected });
      await Promise.resolve();
      if (dealId && expected) {
        const row = rows.get(dealId);
        if (row && row.version === expected) {
          row.data = structuredClone(deal); row.version = stamp();
          return { status: 'saved', dealId, version: row.version };
        }
        return { status: 'conflict', theirs: row ? { ...structuredClone(row.data), _deal_id: dealId } : null, version: row?.version ?? null };
      }
      const id = dealId || `uuid-${nextId++}`;
      rows.set(id, { data: structuredClone(deal), version: stamp() });
      return { status: 'saved', dealId: id, version: rows.get(id).version };
    },
  };
}

// A device: its deals state plus a sync engine, edited the way the app does (clone + replace).
function device(server, save = (...a) => server.save(...a)) {
  const sync = createDealSync({ save });
  const dev = {
    sync, deals: [],
    load() { const { deals, versions } = server.read(); dev.deals = deals; sync.adopt(deals, versions); },
    edit(id, fn) { dev.deals = dev.deals.map(d => d.id === id ? fn(structuredClone(d)) : d); },
    add(deal) { dev.deals = [...dev.deals, deal]; },
    async flush() {
      const r = await sync.flush(() => dev.deals);
      if (Object.keys(r.newIds).length) dev.deals = sync.applyNewIds(dev.deals, r.newIds);
      return r;
    },
  };
  return dev;
}

const deal = (id, address, price = 400000) => ({ id, address, status: 'Analyzing', assumptions: { purchasePrice: price, units: [{ rent: 1500 }] } });
const priceOf = (server, uuid) => server.rows.get(uuid).data.assumptions.purchasePrice;

let server, u1, u2;
beforeEach(() => {
  server = fakeServer();
  u1 = server.seed(deal('d1', '12 Oak St'));
  u2 = server.seed(deal('d2', '40 Elm Ave'));
});

describe('sync engine — two devices', () => {
  test('loading from the cloud writes nothing back', async () => {
    const a = device(server); a.load();
    expect(a.sync.changed(a.deals)).toEqual([]);
    await a.flush();
    expect(server.calls).toHaveLength(0);
  });

  test('a reorder writes nothing (same deal objects)', async () => {
    const a = device(server); a.load();
    a.deals = [...a.deals].reverse();
    await a.flush();
    expect(server.calls).toHaveLength(0);
  });

  test('only edited deals are saved, each on top of the version it loaded', async () => {
    const a = device(server); a.load();
    const before = server.rows.get(u1).version;
    a.edit('d1', d => { d.assumptions.purchasePrice = 410000; return d; });
    await a.flush();
    expect(server.calls).toEqual([{ id: 'd1', dealId: u1, expected: before }]);
    expect(priceOf(server, u1)).toBe(410000);
  });

  test('second device editing a stale copy gets a conflict instead of overwriting', async () => {
    const a = device(server); a.load();
    const b = device(server); b.load();
    a.edit('d1', d => { d.assumptions.purchasePrice = 410000; return d; });
    await a.flush();
    b.edit('d1', d => { d.assumptions.purchasePrice = 380000; return d; });
    const r = await b.flush();
    expect(r.conflictIds).toEqual(['d1']);
    expect(priceOf(server, u1)).toBe(410000);           // A's save survives
    const [c] = b.sync.listConflicts(b.deals);
    expect(c.theirs.assumptions.purchasePrice).toBe(410000);
    expect(c.mine.assumptions.purchasePrice).toBe(380000);
  });

  test('a deal awaiting a choice is not retried, even after more edits', async () => {
    const a = device(server); a.load();
    const b = device(server); b.load();
    a.edit('d1', d => { d.address = 'A'; return d; }); await a.flush();
    b.edit('d1', d => { d.address = 'B'; return d; }); await b.flush();
    const n = server.calls.length;
    b.edit('d1', d => { d.address = 'B2'; return d; });
    expect(b.sync.changed(b.deals)).toEqual([]);
    await b.flush();
    expect(server.calls.length).toBe(n);
  });

  test('keep mine overwrites the cloud with the latest local copy; the other device then conflicts', async () => {
    const a = device(server); a.load();
    const b = device(server); b.load();
    a.edit('d1', d => { d.address = 'A'; return d; }); await a.flush();
    b.edit('d1', d => { d.address = 'B'; return d; }); await b.flush();
    b.edit('d1', d => { d.address = 'B final'; return d; });
    b.sync.keepMine('d1', b.deals.find(d => d.id === 'd1'));
    const r = await b.flush();
    expect(r.conflictIds).toEqual([]);
    expect(server.rows.get(u1).data.address).toBe('B final');
    a.edit('d1', d => { d.address = 'A again'; return d; });
    expect((await a.flush()).conflictIds).toEqual(['d1']);
    expect(server.rows.get(u1).data.address).toBe('B final');
  });

  test('load theirs swaps in the cloud copy and leaves nothing to save', async () => {
    const a = device(server); a.load();
    const b = device(server); b.load();
    a.edit('d1', d => { d.address = 'A'; return d; }); await a.flush();
    b.edit('d1', d => { d.address = 'B'; return d; }); await b.flush();
    const theirs = b.sync.loadTheirs('d1', b.deals.find(d => d.id === 'd1'));
    b.deals = b.deals.map(d => d.id === 'd1' ? theirs : d);
    expect(theirs).toMatchObject({ id: 'd1', _deal_id: u1, address: 'A' });
    expect(b.sync.changed(b.deals)).toEqual([]);
    // and B's next edit saves cleanly on top of A's version
    b.edit('d1', d => { d.address = 'B after'; return d; });
    expect((await b.flush()).conflictIds).toEqual([]);
    expect(server.rows.get(u1).data.address).toBe('B after');
  });

  test('deleted on another device: keep mine restores it, load theirs removes it', async () => {
    const b = device(server); b.load();
    server.rows.delete(u1);
    b.edit('d1', d => { d.address = 'still here'; return d; });
    await b.flush();
    const [c] = b.sync.listConflicts(b.deals);
    expect(c.theirs).toBeNull();

    b.sync.keepMine('d1', b.deals.find(d => d.id === 'd1'));
    await b.flush();
    expect(server.rows.get(u1).data.address).toBe('still here'); // recreated under the same uuid

    const c3 = device(server); c3.load();
    server.rows.delete(u2);
    c3.edit('d2', d => { d.address = 'x'; return d; }); await c3.flush();
    expect(c3.sync.loadTheirs('d2', c3.deals.find(d => d.id === 'd2'))).toBeNull();
  });

  test('identical content already in the cloud is not a conflict (key order ignored)', async () => {
    const a = device(server); a.load();
    const b = device(server); b.load();
    a.edit('d1', d => { d.status = 'Offer'; return d; }); await a.flush();
    // B makes the same edit; the server copy comes back with a different key order
    const row = server.rows.get(u1);
    const reorder = v => Array.isArray(v) ? v.map(reorder)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
    row.data = reorder(row.data);
    b.edit('d1', d => { d.status = 'Offer'; return d; });
    expect((await b.flush()).conflictIds).toEqual([]);
    expect(b.sync.changed(b.deals)).toEqual([]);
  });

  test('a new deal is inserted once, even if edited while its first save is in flight', async () => {
    let release, started;
    const startedP = new Promise(r => { started = r; });
    const gate = new Promise(r => { release = r; });
    let gated = true;
    const a = device(server, async (...args) => {
      if (gated) { gated = false; started(); await gate; }
      return server.save(...args);
    });
    a.load();
    a.add(deal('d3', 'New St'));
    const first = a.sync.flush(() => a.deals);
    await startedP;                                                    // insert is in flight
    a.edit('d3', d => { d.address = 'New St (edited)'; return d; });  // before the uuid comes back
    // queued behind the insert, and runs before the app has put the uuid into state
    const second = a.sync.flush(() => a.deals);
    release();
    const [r1] = await Promise.all([first, second]);
    a.deals = a.sync.applyNewIds(a.deals, r1.newIds);
    const uuids = [...server.rows.keys()];
    expect(uuids).toHaveLength(3);
    const d3 = a.deals.find(d => d.id === 'd3');
    expect(d3._deal_id).toBeTruthy();
    expect(server.rows.get(d3._deal_id).data.address).toBe('New St (edited)');
    expect(server.calls.filter(c => c.id === 'd3').map(c => !!c.expected)).toEqual([false, true]);
  });

  test('overlapping flushes run one at a time (no conflict with ourselves)', async () => {
    const a = device(server); a.load();
    a.edit('d1', d => { d.address = 'one'; return d; });
    const p1 = a.flush();
    a.edit('d1', d => { d.address = 'two'; return d; });
    const p2 = a.flush();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.conflictIds).toEqual([]);
    expect(r2.conflictIds).toEqual([]);
    expect(server.rows.get(u1).data.address).toBe('two');
  });

  test('coming back online saves only the deals edited offline', async () => {
    const a = device(server); a.load();
    const b = device(server); b.load();
    b.edit('d2', d => { d.address = 'B online edit'; return d; }); await b.flush();
    // A was offline: edited d1 only, then reconnects
    a.edit('d1', d => { d.address = 'A offline edit'; return d; });
    expect((await a.flush()).conflictIds).toEqual([]);
    expect(server.rows.get(u1).data.address).toBe('A offline edit');
    expect(server.rows.get(u2).data.address).toBe('B online edit'); // untouched by A
  });

  test('a failed save keeps the change pending for the next attempt', async () => {
    let fail = true;
    const a = device(server, (...args) => fail ? Promise.reject(new Error('offline')) : server.save(...args));
    a.load();
    a.edit('d1', d => { d.address = 'retry me'; return d; });
    await expect(a.flush()).rejects.toThrow('offline');
    expect(a.sync.changed(a.deals).map(d => d.id)).toEqual(['d1']);
    fail = false;
    await a.flush();
    expect(server.rows.get(u1).data.address).toBe('retry me');
  });
});

describe('sameDealContent', () => {
  test('ignores _deal_id and key order, sees real differences', () => {
    expect(sameDealContent({ a: 1, b: { c: 2 }, _deal_id: 'x' }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(sameDealContent({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameDealContent({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

// ─── sbSaveDeal against Supabase ──────────────────────────────────────────────
describe('sbSaveDeal', () => {
  beforeEach(() => { globalThis.__results = []; globalThis.__queries = []; });
  const D = { id: 'd1', address: '12 Oak St', assumptions: { purchasePrice: 1, units: [{}] }, _deal_id: 'uuid-1' };

  test('with a version: conditional update filtered on deal, owner and updated_at', async () => {
    globalThis.__results = [{ data: [{ deal_id: 'uuid-1', updated_at: 'v2' }], error: null }];
    const r = await sbSaveDeal(D, 'uuid-1', 'v1');
    expect(r).toEqual({ status: 'saved', dealId: 'uuid-1', version: 'v2' });
    const calls = globalThis.__queries[0].calls;
    expect(calls[0][0]).toBe('update');
    expect(calls).toContainEqual(['eq', 'deal_id', 'uuid-1']);
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(calls).toContainEqual(['eq', 'updated_at', 'v1']);
  });

  test('no row updated → returns the cloud copy as a conflict, without writing', async () => {
    globalThis.__results = [
      { data: [], error: null },
      { data: { deal_id: 'uuid-1', deal_data: { ...D, address: 'theirs' }, updated_at: 'v9' }, error: null },
    ];
    const r = await sbSaveDeal(D, 'uuid-1', 'v1');
    expect(r.status).toBe('conflict');
    expect(r.version).toBe('v9');
    expect(r.theirs).toMatchObject({ address: 'theirs', _deal_id: 'uuid-1' });
    expect(globalThis.__queries[1].calls.map(c => c[0])).not.toContain('update');
  });

  test('row gone → conflict with theirs null', async () => {
    globalThis.__results = [{ data: [], error: null }, { data: null, error: null }];
    expect(await sbSaveDeal(D, 'uuid-1', 'v1')).toEqual({ status: 'conflict', theirs: null, version: null });
  });

  test('without a version (new deal): upsert, returns the new uuid and version', async () => {
    globalThis.__results = [{ data: { deal_id: 'uuid-new', updated_at: 'v1' }, error: null }];
    const r = await sbSaveDeal({ ...D, _deal_id: undefined }, undefined, undefined);
    expect(r).toEqual({ status: 'saved', dealId: 'uuid-new', version: 'v1' });
    expect(globalThis.__queries[0].calls[0][0]).toBe('upsert');
    expect(globalThis.__queries[0].calls[0][1]).not.toHaveProperty('deal_id');
  });

  test('database errors throw (so the change stays pending)', async () => {
    globalThis.__results = [{ data: null, error: { message: 'boom' } }];
    await expect(sbSaveDeal(D, 'uuid-1', 'v1')).rejects.toThrow('SaveDeal: boom');
  });
});
