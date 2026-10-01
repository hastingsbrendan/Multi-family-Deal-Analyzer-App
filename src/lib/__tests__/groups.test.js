import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Chainable Supabase mock ────────────────────────────────────────────────
// Globals so test bodies can configure responses + read query history.
// vi.mock is hoisted, so we attach the mock state to globalThis to avoid
// the "cannot access before initialization" trap with module-scoped vars.
globalThis.__mockResults = [];
globalThis.__queryLog = [];

vi.mock('../constants', () => {
  const next = () => globalThis.__mockResults.shift() ?? { data: null, error: null };
  function makeQuery(table) {
    const entry = { table, calls: [] };
    globalThis.__queryLog.push(entry);
    const q = {};
    const chainMethods = ['select','insert','update','delete','upsert','eq','in','is','not','order','limit','contains'];
    const terminalMethods = ['single','maybeSingle'];
    chainMethods.forEach(m => { q[m] = (...args) => { entry.calls.push([m, ...args]); return q; }; });
    terminalMethods.forEach(m => { q[m] = () => { entry.calls.push([m]); return Promise.resolve(next()); }; });
    q.then = (resolve, reject) => Promise.resolve(next()).then(resolve, reject);
    return q;
  }
  return {
    sbClient: {
      auth: { getUser: async () => ({ data: { user: { id: 'user-123', email: 'u@x.com' } } }) },
      from: makeQuery,
      rpc: (fn, args) => {
        globalThis.__queryLog.push({ rpc: fn, args, calls: [] });
        return Promise.resolve(next());
      },
    },
    sbWriteDeal: async (deal) => deal._deal_id || 'new-uuid',
  };
});

import {
  sbGetMyGroups, sbGetPendingInvites, sbCreateGroup, sbInviteMember,
  sbRespondToInvite, sbLeaveGroup, sbGetGroupMembers, sbUpdateMemberRole,
  sbRemoveMember, sbGetGroupDeals, sbShareDealToGroup, sbSaveSharedDeal, sbRemoveDealFromGroup,
  sbReorderGroupDeals, sbGetComments, sbPostComment, sbDeleteComment, sbEditComment,
} from '../groups';

beforeEach(() => {
  globalThis.__mockResults = [];
  globalThis.__queryLog = [];
});

const setResults = (arr) => { globalThis.__mockResults = arr; };
const log = () => globalThis.__queryLog;

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('sbGetMyGroups', () => {
  it('returns empty array when user has no memberships', async () => {
    setResults([{ data: [], error: null }]);
    expect(await sbGetMyGroups()).toEqual([]);
  });

  it('joins memberships with groups and tags role/status', async () => {
    setResults([
      { data: [{ group_id: 'g1', role: 'Owner', status: 'active' }], error: null },
      { data: [{ id: 'g1', name: 'Investors', description: '' }], error: null },
    ]);
    const groups = await sbGetMyGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].role).toBe('Owner');
    expect(groups[0].name).toBe('Investors');
  });
});

describe('sbGetPendingInvites', () => {
  it('queries group_members where status=pending', async () => {
    setResults([{ data: [], error: null }]);
    await sbGetPendingInvites();
    expect(log()[0].table).toBe('group_members');
    const eqCalls = log()[0].calls.filter(c => c[0] === 'eq');
    expect(eqCalls).toContainEqual(['eq', 'status', 'pending']);
  });
});

describe('sbCreateGroup', () => {
  it('inserts group and adds creator as Owner', async () => {
    setResults([
      { data: { id: 'g-new', name: 'My Group' }, error: null },
      { data: null, error: null },
    ]);
    const result = await sbCreateGroup('My Group', 'desc');
    expect(result.id).toBe('g-new');
    expect(log().map(q => q.table)).toEqual(['groups', 'group_members']);
  });

  it('throws on insert error', async () => {
    setResults([{ data: null, error: { message: 'duplicate' } }]);
    await expect(sbCreateGroup('X', '')).rejects.toBeTruthy();
  });
});

describe('sbInviteMember', () => {
  it('returns pending:true when email not registered', async () => {
    setResults([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    const r = await sbInviteMember('g1', 'new@x.com', 'Editor');
    expect(r.pending).toBe(true);
    expect(log()[1].table).toBe('group_invites_pending');
  });

  it('inserts membership when user exists', async () => {
    setResults([
      { data: 'user-99', error: null },
      { data: null, error: null },
    ]);
    const r = await sbInviteMember('g1', 'existing@x.com', 'Viewer');
    expect(r.pending).toBe(false);
    expect(log()[1].table).toBe('group_members');
    const insert = log()[1].calls.find(c => c[0] === 'insert');
    expect(insert[1].user_id).toBe('user-99');
  });

  // Lookup goes through find_user_id_by_email (matches auth.users' verified email)
  // instead of reading profiles.email, which users could previously overwrite to
  // intercept invites — and which RLS no longer exposes to other users.
  it('looks the invitee up via the find_user_id_by_email RPC, not profiles', async () => {
    setResults([{ data: null, error: null }, { data: null, error: null }]);
    await sbInviteMember('g1', 'someone@x.com', 'Viewer');
    expect(log()[0].rpc).toBe('find_user_id_by_email');
    expect(log()[0].args).toEqual({ p_email: 'someone@x.com' });
    expect(log().some(e => e.table === 'profiles')).toBe(false);
  });

  it('throws when the lookup fails instead of silently creating a pending invite', async () => {
    setResults([{ data: null, error: { message: 'permission denied' } }]);
    await expect(sbInviteMember('g1', 'someone@x.com', 'Viewer')).rejects.toBeTruthy();
    expect(log().length).toBe(1);
  });
});

describe('sbRespondToInvite', () => {
  it('accepts → updates status=active', async () => {
    setResults([{ data: null, error: null }]);
    await sbRespondToInvite('g1', true);
    const updateCall = log()[0].calls.find(c => c[0] === 'update');
    expect(updateCall[1]).toEqual({ status: 'active' });
  });

  it('declines → deletes the membership', async () => {
    setResults([{ data: null, error: null }]);
    await sbRespondToInvite('g1', false);
    expect(log()[0].calls.some(c => c[0] === 'delete')).toBe(true);
  });
});

describe('sbLeaveGroup / sbRemoveMember / sbUpdateMemberRole', () => {
  it('sbLeaveGroup deletes membership for current user', async () => {
    setResults([{ data: null, error: null }]);
    await sbLeaveGroup('g1');
    expect(log()[0].calls.some(c => c[0] === 'delete')).toBe(true);
  });

  it('sbRemoveMember deletes another user from group', async () => {
    setResults([{ data: null, error: null }]);
    await sbRemoveMember('g1', 'member-99');
    expect(log()[0].table).toBe('group_members');
    expect(log()[0].calls.some(c => c[0] === 'delete')).toBe(true);
  });

  it('sbUpdateMemberRole updates role field', async () => {
    setResults([{ data: null, error: null }]);
    await sbUpdateMemberRole('g1', 'member-99', 'Editor');
    const updateCall = log()[0].calls.find(c => c[0] === 'update');
    expect(updateCall[1]).toEqual({ role: 'Editor' });
  });
});

describe('sbGetGroupDeals / sbReorderGroupDeals', () => {
  it('sbGetGroupDeals queries group_deals for a group', async () => {
    setResults([{ data: [], error: null }]);
    await sbGetGroupDeals('g1');
    expect(log()[0].table).toBe('group_deal_refs');
  });

  it('sbReorderGroupDeals issues per-deal queries', async () => {
    setResults([{ data: null, error: null }, { data: null, error: null }]);
    await sbReorderGroupDeals('g1', ['deal-a', 'deal-b']);
    expect(log().length).toBeGreaterThanOrEqual(2);
  });
});

describe('sbGetGroupDeals versions', () => {
  it("keeps each row's updated_at as _version", async () => {
    setResults([
      { data: [{ deal_id: 'uuid-1', owner_user_id: 'o', shared_by: 'o', shared_at: 't', sort_order: 1 }], error: null },
      { data: [{ deal_id: 'uuid-1', deal_data: { id: 'd1', address: 'x' }, user_id: 'o', updated_at: 'v7' }], error: null },
    ]);
    const [d] = await sbGetGroupDeals('g1');
    expect(d).toMatchObject({ id: 'd1', _deal_id: 'uuid-1', _owner_user_id: 'o', _version: 'v7' });
  });
});

// BACK-121 — group-view edits save through the save_shared_deal function (Editors can't
// UPDATE deals they don't own under RLS), on top of the version they loaded.
describe('sbSaveSharedDeal', () => {
  const D = { id: 'd1', address: '12 Oak', assumptions: { units: [] },
    _deal_id: 'uuid-1', _owner_user_id: 'owner', _shared_at: 't', _sort_order: 3, _version: 'v1' };

  it('calls save_shared_deal with the version, without group-only fields', async () => {
    setResults([{ data: { status: 'saved', version: 'v2' }, error: null }]);
    const r = await sbSaveSharedDeal(D, 'uuid-1', 'v1');
    expect(r).toEqual({ status: 'saved', dealId: 'uuid-1', version: 'v2' });
    const call = log()[0];
    expect(call.rpc).toBe('save_shared_deal');
    expect(call.args.p_deal_id).toBe('uuid-1');
    expect(call.args.p_expected).toBe('v1');
    expect(call.args.p_deal_data).toEqual({ id: 'd1', address: '12 Oak', assumptions: { units: [] } });
    expect(log().some(e => e.table === 'deals')).toBe(false); // never a direct write
  });

  it("a conflict returns the cloud copy with this copy's group fields", async () => {
    setResults([{ data: { status: 'conflict', theirs: { id: 'd1', address: 'theirs' }, version: 'v9' }, error: null }]);
    const r = await sbSaveSharedDeal(D, 'uuid-1', 'v1');
    expect(r.status).toBe('conflict');
    expect(r.version).toBe('v9');
    expect(r.theirs).toMatchObject({ address: 'theirs', _deal_id: 'uuid-1', _owner_user_id: 'owner', _sort_order: 3 });
  });

  it('deleted elsewhere → theirs null', async () => {
    setResults([{ data: { status: 'conflict', theirs: null, version: null }, error: null }]);
    expect(await sbSaveSharedDeal(D, 'uuid-1', 'v1')).toEqual({ status: 'conflict', theirs: null, version: null });
  });

  it('no known version is sent as null (the function then returns the current copy)', async () => {
    setResults([{ data: { status: 'conflict', theirs: { id: 'd1' }, version: 'v1' }, error: null }]);
    await sbSaveSharedDeal(D, 'uuid-1', undefined);
    expect(log()[0].args.p_expected).toBeNull();
  });

  it('a refusal (e.g. Viewer) throws instead of being swallowed', async () => {
    setResults([{ data: null, error: { message: 'not allowed to edit this deal' } }]);
    await expect(sbSaveSharedDeal(D, 'uuid-1', 'v1')).rejects.toThrow('not allowed');
  });
});

describe('sbShareDealToGroup / sbRemoveDealFromGroup', () => {
  it('sbShareDealToGroup links to group_deals', async () => {
    const deal = { id: 'd1', _deal_id: 'uuid-1', address: '123 Test',
      assumptions: { units: [], numUnits: 2 }, comps: [], showing: {} };
    setResults([{ data: null, error: null }]);
    await sbShareDealToGroup(deal, 'g1');
    expect(log()[0].table).toBe('group_deal_refs');
  });

  it('sbRemoveDealFromGroup deletes the link row', async () => {
    setResults([{ data: null, error: null }]);
    await sbRemoveDealFromGroup('uuid-1', 'g1');
    expect(log()[0].table).toBe('group_deal_refs');
    expect(log()[0].calls.some(c => c[0] === 'delete')).toBe(true);
  });
});

describe('Comments', () => {
  it('sbGetComments queries the comments table', async () => {
    setResults([{ data: [], error: null }]);
    await sbGetComments('g1', 'd1');
    expect(log()[0].table).toMatch(/comment/);
  });

  it('sbPostComment inserts a row', async () => {
    setResults([{ data: { id: 'c1' }, error: null }]);
    await sbPostComment('g1', 'd1', 'Hello');
    expect(log()[0].calls.some(c => c[0] === 'insert')).toBe(true);
  });

  it('sbDeleteComment deletes by id', async () => {
    setResults([{ data: null, error: null }]);
    await sbDeleteComment('c1');
    expect(log()[0].calls.some(c => c[0] === 'delete')).toBe(true);
  });

  it('sbEditComment updates body', async () => {
    setResults([{ data: null, error: null }]);
    await sbEditComment('c1', 'edited');
    const updateCall = log()[0].calls.find(c => c[0] === 'update');
    expect(updateCall[1].body).toBe('edited');
  });
});
