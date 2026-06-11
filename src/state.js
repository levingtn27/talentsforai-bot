/**
 * In-memory state manager
 * Handles wizard sessions (per chat) and pending changes queue
 */

const sessions = new Map();   // chatId → wizard state
const changes  = new Map();   // changeId → change object

let _counter = 1;

function genId() {
  return `c${String(_counter++).padStart(4, '0')}`;
}

function now() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

// ─── Wizard sessions ──────────────────────────────────────────────────────────
function get(chatId) { return sessions.get(chatId) || null; }
function set(chatId, data) { sessions.set(chatId, data); }
function clear(chatId) { sessions.delete(chatId); }

// ─── Change queue ─────────────────────────────────────────────────────────────
function queueChange(payload) {
  const id = genId();
  changes.set(id, {
    id,
    ...payload,
    status: 'pending',
    createdAt: now(),
  });
  return id;
}

function getChange(id) { return changes.get(id) || null; }

function getPendingChanges() {
  return [...changes.values()].filter(c => c.status === 'pending');
}

function resolveChange(id, status) {
  const c = changes.get(id);
  if (c) { c.status = status; c.resolvedAt = now(); }
}

module.exports = { get, set, clear, queueChange, getChange, getPendingChanges, resolveChange };
