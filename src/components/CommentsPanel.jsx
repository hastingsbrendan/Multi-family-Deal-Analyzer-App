import React, { useState, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { sbGetComments, sbPostComment, sbDeleteComment, sbEditComment } from '../lib/groups';

function CommentsPanel({ groupId, dealId, currentUser }) {
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [body, setBody]           = useState('');
  const [posting, setPosting]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody]   = useState('');
  const [error, setError]         = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!groupId || !dealId) return;
    setLoading(true);
    sbGetComments(groupId, dealId)
      .then(data => { setComments(data); setLoading(false); })
      .catch(e => { Sentry.captureException(e, { tags: { origin: 'CommentsPanel.sbGetComments' } }); setLoading(false); });
  }, [groupId, dealId]);

  // Scroll to bottom on new comments
  useEffect(() => {
    if (comments.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handlePost = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    try {
      const comment = await sbPostComment(groupId, dealId, body.trim());
      setComments(prev => [...prev, comment]);
      setBody('');
    } catch (e) {
      setError('Failed to post: ' + e.message);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await sbDeleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      setError('Failed to delete comment.');
      Sentry.captureException(e, { tags: { origin: 'CommentsPanel.handleDelete' } });
    }
  };

  const handleEditSave = async (id) => {
    if (!editBody.trim()) return;
    try {
      const updated = await sbEditComment(id, editBody.trim());
      setComments(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
      setEditingId(null);
    } catch (e) {
      setError('Failed to edit comment.');
      Sentry.captureException(e, { tags: { origin: 'CommentsPanel.handleEditSave' } });
    }
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getInitials = (comment) => {
    const name = comment.profiles?.display_name || comment.profiles?.email || '?';
    return name.slice(0, 2).toUpperCase();
  };

  const getDisplayName = (comment) => {
    return comment.profiles?.display_name || comment.profiles?.email?.split('@')[0] || 'Member';
  };

  const avatarColor = (userId) => {
    const colors = ['#0D9488','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981'];
    const idx = userId ? userId.charCodeAt(0) % colors.length : 0;
    return colors[idx];
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>💬 Group Comments</span>
        {comments.length > 0 && (
          <span style={{
            background: 'var(--accent)', color: '#fff', borderRadius: 99,
            fontSize: 11, fontWeight: 700, padding: '1px 7px'
          }}>{comments.length}</span>
        )}
      </div>

      {/* Comments list */}
      <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Loading comments…</div>
        ) : comments.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0', fontStyle: 'italic' }}>
            No comments yet. Be the first to add one.
          </div>
        ) : (
          comments.map(comment => {
            const isOwn = comment.user_id === currentUser?.id;
            const isEditing = editingId === comment.id;
            return (
              <div key={comment.id} style={{
                display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start'
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: avatarColor(comment.user_id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff'
                }}>
                  {getInitials(comment)}
                </div>

                {/* Bubble */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {getDisplayName(comment)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatTime(comment.created_at)}
                      {comment.updated_at !== comment.created_at && ' · edited'}
                    </span>
                  </div>

                  {isEditing ? (
                    <div>
                      <textarea
                        value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        rows={2}
                        style={{
                          width: '100%', fontSize: 13, padding: '6px 10px',
                          borderRadius: 8, border: '1px solid var(--accent)',
                          background: 'var(--input-bg)', color: 'var(--text)',
                          resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button onClick={() => handleEditSave(comment.id)} style={{
                          background: 'var(--accent)', color: '#fff', border: 'none',
                          borderRadius: 6, padding: '4px 12px', fontSize: 12,
                          fontWeight: 700, cursor: 'pointer'
                        }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{
                          background: 'none', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '4px 10px', fontSize: 12,
                          color: 'var(--muted)', cursor: 'pointer'
                        }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      background: 'var(--accentSoft)', borderRadius: 10,
                      padding: '8px 12px', fontSize: 13, color: 'var(--text)',
                      lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                    }}>
                      {comment.body}
                    </div>
                  )}

                  {/* Actions */}
                  {isOwn && !isEditing && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                      <button onClick={() => { setEditingId(comment.id); setEditBody(comment.body); }}
                        style={{ background: 'none', border: 'none', fontSize: 11,
                          color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>Edit</button>
                      <button onClick={() => handleDelete(comment.id)}
                        style={{ background: 'none', border: 'none', fontSize: 11,
                          color: 'var(--red)', cursor: 'pointer', padding: 0 }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', borderRadius: 8,
          padding: '6px 12px', fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Compose */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
          placeholder="Add a comment… (⌘↵ to post)"
          rows={2}
          style={{
            flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--input-bg)',
            color: 'var(--text)', resize: 'none', fontFamily: 'inherit',
            outline: 'none', transition: 'border-color 0.15s'
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button
          onClick={handlePost}
          disabled={!body.trim() || posting}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 100, padding: '9px 18px', fontSize: 13, fontWeight: 700,
            cursor: body.trim() && !posting ? 'pointer' : 'not-allowed',
            opacity: body.trim() && !posting ? 1 : 0.45, flexShrink: 0,
            transition: 'opacity 0.15s'
          }}>
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

export default CommentsPanel;
