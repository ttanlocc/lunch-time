// client/src/lib/identity.js
//
// Soft identity ("who am I") for the lunch app — no login, no password. The
// user picks their name once from the real people list; we remember it in
// localStorage. This is fine for this app's trust model: the debt board already
// shows everyone's debt to everyone, so "identity" here is a convenience (let
// Lex greet you / answer "did I eat?"), not a security boundary.
//
// The identity grew from a plain name string into a small PROFILE object
// { name, emoji, taste } so Lex can greet you with your chosen avatar and tune
// suggestions to your taste. We keep full backward compatibility: an old
// 'lunch_me' name string is migrated into a profile on first read.
//
// Exposed as hooks so any component stays in sync. Changes broadcast a
// `lunch-me-changed` event (same-tab) and ride the native `storage` event
// (cross-tab).

import { useState, useEffect } from 'react';

const LEGACY_KEY = 'lunch_me';
const PROFILE_KEY = 'lunch_profile';
const EVENT = 'lunch-me-changed';

// Read the full profile object, migrating a legacy plain-name string forward.
// Returns null when nothing is stored.
export function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.name) return { name: p.name, emoji: p.emoji ?? null, taste: p.taste ?? null };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = { name: legacy, emoji: null, taste: null };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(LEGACY_KEY);
      } catch { /* storage disabled — still return the migrated value */ }
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

// Write the full profile, or clear identity entirely when passed null.
export function setProfile(profileOrNull) {
  try {
    if (profileOrNull && profileOrNull.name) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        name: profileOrNull.name,
        emoji: profileOrNull.emoji ?? null,
        taste: profileOrNull.taste ?? null,
      }));
      localStorage.removeItem(LEGACY_KEY);
    } else {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    /* private mode / storage disabled — hook still works in-memory for this tab */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: profileOrNull || null }));
}

// ── name-only compatibility layer (unchanged public shape) ───────────────────

export function getMe() {
  return getProfile()?.name ?? null;
}

export function setMe(name) {
  if (!name) { setProfile(null); return; }
  const cur = getProfile();
  setProfile({ ...(cur || { emoji: null, taste: null }), name });
}

// Stable chat thread id per person, persisted so a refresh continues the same
// thread. Switching person (or same person on a fresh browser) starts a new one.
// Used to group logged chat turns/feedback for later analysis.
const THREAD_KEY = 'lunch_thread';
export function getThreadId(name) {
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (t && t.name === name && t.id) return t.id;
    }
    const id = (crypto?.randomUUID?.() || `t-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(THREAD_KEY, JSON.stringify({ name, id }));
    return id;
  } catch {
    return `t-${Date.now()}`;
  }
}

// [me, setMe] — mirrors useState's shape so callers read naturally (me = name).
export function useMe() {
  const [me, setState] = useState(getMe);
  useEffect(() => {
    const sync = () => setState(getMe());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync); // another tab changed it
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [me, setMe];
}

// [profile, setProfile] — same event/storage sync as useMe, but the whole
// { name, emoji, taste } object.
export function useProfile() {
  const [profile, setState] = useState(getProfile);
  useEffect(() => {
    const sync = () => setState(getProfile());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [profile, setProfile];
}
