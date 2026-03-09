// ─── Groups & Comments Supabase API ──────────────────────────────────────────
// Extracted from calc.js (BACK-003) — groups concerns are separate from the
// financial calculation engine. Import groups functions from here, not calc.js.
import { sbClient, sbWriteDeal } from './constants';

async function sbGetMyGroups() {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return [];
  const { data: memberships } = await sbClient
    .from('group_members').select('group_id, role, status').eq('user_id', user.id);
  if (!memberships?.length) return [];
  const groupIds = memberships.map(m => m.group_id);
  const { data: groups } = await sbClient
    .from('groups').select('id, name, description, created_by, created_at').in('id', groupIds);
  return (groups || []).map(g => ({
    ...g,
    role:   memberships.find(m => m.group_id === g.id)?.role   || 'Viewer',
    status: memberships.find(m => m.group_id === g.id)?.status || 'active' }));
}

async function sbGetPendingInvites() {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return [];
  const { data } = await sbClient
    .from('group_members')
    .select('group_id, role, invited_by, created_at, groups(name, description)')
    .eq('user_id', user.id).eq('status', 'pending');
  return data || [];
}

async function sbCreateGroup(name, description) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: group, error } = await sbClient
    .from('groups').insert({ name, description: description || '', created_by: user.id })
    .select().single();
  if (error) throw error;
  await sbClient.from('group_members').insert({
    group_id: group.id, user_id: user.id, role: 'Owner',
    status: 'active', invited_by: user.id
  });
  return group;
}

async function sbInviteMember(groupId, email, role) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await sbClient
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (!profile) {
    const { error } = await sbClient.from('group_invites_pending')
      .insert({ group_id: groupId, invited_email: email, role, invited_by: user.id });
    if (error) throw error;
    return { pending: true };
  }
  const { error } = await sbClient.from('group_members')
    .insert({ group_id: groupId, user_id: profile.id, role, status: 'pending', invited_by: user.id });
  if (error) throw error;
  return { pending: false };
}

async function sbRespondToInvite(groupId, accept) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return;
  if (accept) {
    await sbClient.from('group_members').update({ status: 'active' })
      .eq('group_id', groupId).eq('user_id', user.id);
  } else {
    await sbClient.from('group_members').delete()
      .eq('group_id', groupId).eq('user_id', user.id);
  }
}

async function sbLeaveGroup(groupId) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) return;
  await sbClient.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', user.id);
}

async function sbGetGroupMembers(groupId) {
  const { data } = await sbClient
    .from('group_members')
    .select('user_id, role, status, profiles(display_name, email)')
    .eq('group_id', groupId);
  return data || [];
}

async function sbUpdateMemberRole(groupId, memberId, newRole) {
  await sbClient.from('group_members').update({ role: newRole })
    .eq('group_id', groupId).eq('user_id', memberId);
}

async function sbRemoveMember(groupId, memberId) {
  await sbClient.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', memberId);
}

// ── Group deal refs (A2 schema) ──────────────────────────────────────────────

// Load group deals via refs: fetch refs → fetch owner deal rows → return deal objects
async function sbGetGroupDeals(groupId) {
  const { data: refs, error: refsErr } = await sbClient
    .from('group_deal_refs')
    .select('deal_id, owner_user_id, shared_by, shared_at, sort_order')
    .eq('group_id', groupId)
    .order('sort_order', { ascending: true });
  if (refsErr || !refs?.length) return [];

  const dealIds = refs.map(r => r.deal_id);
  const { data: dealRows, error: dealsErr } = await sbClient
    .from('deals')
    .select('deal_id, deal_data, user_id, updated_at')
    .in('deal_id', dealIds);
  if (dealsErr) return [];

  return refs
    .map(ref => {
      const row = dealRows?.find(d => d.deal_id === ref.deal_id);
      if (!row?.deal_data) return null;
      return {
        ...row.deal_data,
        _deal_id: row.deal_id,
        _owner_user_id: row.user_id,
        _shared_at: ref.shared_at,
        _sort_order: ref.sort_order,
      };
    })
    .filter(Boolean);
}

// Share a deal into a group — writes a ref row (no data copy)
async function sbShareDealToGroup(deal, groupId) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  let dealId = deal._deal_id;
  if (!dealId) dealId = await sbWriteDeal(deal);
  const { error } = await sbClient.from('group_deal_refs').upsert({
    group_id: groupId,
    deal_id: dealId,
    owner_user_id: user.id,
    shared_by: user.id,
    shared_at: new Date().toISOString(),
    sort_order: Date.now(),
  }, { onConflict: 'group_id,deal_id' });
  if (error) throw error;
  return { ...deal, _deal_id: dealId };
}

// Remove a deal from a group (deletes the ref, not the deal itself)
async function sbRemoveDealFromGroup(dealId, groupId) {
  await sbClient.from('group_deal_refs')
    .delete()
    .eq('group_id', groupId)
    .eq('deal_id', dealId);
}

// Update sort order for group deals
async function sbReorderGroupDeals(groupId, orderedDealIds) {
  const updates = orderedDealIds.map((dealId, i) =>
    sbClient.from('group_deal_refs')
      .update({ sort_order: i })
      .eq('group_id', groupId)
      .eq('deal_id', dealId)
  );
  await Promise.all(updates);
}

// ── Group comments ────────────────────────────────────────────────────────────

async function sbGetComments(groupId, dealId) {
  const { data, error } = await sbClient
    .from('group_comments')
    .select('id, user_id, body, created_at, updated_at, profiles(display_name, email)')
    .eq('group_id', groupId)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

async function sbPostComment(groupId, dealId, body) {
  const { data: { user } } = await sbClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await sbClient.from('group_comments')
    .insert({ group_id: groupId, deal_id: dealId, user_id: user.id, body })
    .select('id, user_id, body, created_at, updated_at, profiles(display_name, email)')
    .single();
  if (error) throw error;
  return data;
}

async function sbDeleteComment(commentId) {
  await sbClient.from('group_comments').delete().eq('id', commentId);
}

async function sbEditComment(commentId, body) {
  const { data, error } = await sbClient.from('group_comments')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .select('id, body, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export {
  sbGetMyGroups, sbGetPendingInvites, sbCreateGroup, sbInviteMember,
  sbRespondToInvite, sbLeaveGroup, sbGetGroupMembers, sbUpdateMemberRole,
  sbRemoveMember, sbGetGroupDeals, sbShareDealToGroup, sbRemoveDealFromGroup,
  sbReorderGroupDeals, sbGetComments, sbPostComment, sbDeleteComment, sbEditComment
};
