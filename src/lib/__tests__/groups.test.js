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
    },
    sbWriteDeal: async (deal) => deal._deal_id || 'new-uuid',
  };
});

import {
  sbGetMyGroups, sbGetPendingInvites, sbCreateGroup, sbInviteMember,
  sbRespondToInvite, sbLeaveGroup, sbGetGroupMembers, sbUpdateMemberRole,
  sbRemoveMember, sbGetGroupDeals, sbShareDealToGroup, sbRemoveDealFromGroup,
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
      { data: { id: 'profile-99' }, error: null },
      { data: null, error: null },
    ]);
    const r = await sbInviteMember('g1', 'existing@x.com', 'Viewer');
    expect(r.pending).toBe(false);
    expect(log()[1].table).toBe('group_members');
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
