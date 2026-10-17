// Thin data layer over supabase-js. Every call throws on error so callers can toast it.

import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export function isConfigured() {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('YOUR_') &&
    !SUPABASE_KEY.includes('YOUR_')
  );
}

let client = null;

function db() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}

async function unwrap(request) {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

const PAGE_SIZE = 1000;

/** Reads a whole table in pages: the API returns at most 1000 rows per request. */
async function fetchAll(table, columns = '*', [primary, tieBreaker] = ['created_at', 'id']) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await unwrap(
      db()
        .from(table)
        .select(columns)
        .order(primary, { ascending: true })
        .order(tieBreaker, { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Folder of the app, used as the redirect target of links sent by email. */
function appUrl() {
  return new URL('.', window.location.href).href;
}

// ------------------------------------------------------------------ auth

export async function getSession() {
  const { data, error } = await db().auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signInWithPassword(email, password) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password) {
  const { error } = await db().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

/** callback(event, session). Events include SIGNED_IN, SIGNED_OUT and PASSWORD_RECOVERY. */
export function onAuthChange(callback) {
  db().auth.onAuthStateChange((event, session) => callback(event, session));
}

/** Returns the session when the project does not require email confirmation, otherwise null. */
export async function signUp(email, password, policyVersion) {
  const { data, error } = await db().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appUrl(), data: { policy_version: policyVersion } },
  });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function requestPasswordReset(email) {
  const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  // Local scope: only this browser is signed out, not the user's other devices.
  const { error } = await db().auth.signOut({ scope: 'local' });
  if (error) throw new Error(error.message);
}

/** Deletes the account and, through cascading foreign keys, every row that belongs to it. */
export function deleteAccount() {
  return unwrap(db().rpc('delete_my_account'));
}

// ------------------------------------------------------------------ consents

export function listConsents() {
  return unwrap(db().from('consents').select('*').order('accepted_at', { ascending: false }));
}

export function acceptPrivacy(policyVersion) {
  return unwrap(db().from('consents').insert({ policy_version: policyVersion }).select());
}

// ------------------------------------------------------------------ export

export async function exportAll() {
  // [table, ordering columns]: not every table has the same primary key or timestamp column.
  const tables = [
    ['applications', ['created_at', 'id']],
    ['application_events', ['created_at', 'id']],
    ['templates', ['created_at', 'id']],
    ['alert_keywords', ['created_at', 'id']],
    ['user_settings', ['created_at', 'user_id']],
    ['consents', ['accepted_at', 'id']],
  ];
  const results = await Promise.all(tables.map(([table, order]) => fetchAll(table, '*', order)));
  return Object.fromEntries(tables.map(([table], index) => [table, results[index]]));
}

// ------------------------------------------------------------------ settings

export async function getSettings() {
  const { data, error } = await db().from('user_settings').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export function saveSettings(userId, patch) {
  return unwrap(
    db().from('user_settings').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' }).select().single(),
  );
}

// ------------------------------------------------------------------ applications

export async function listApplications() {
  const rows = await fetchAll('applications');
  return rows.reverse(); // newest first
}

export function createApplications(rows) {
  return unwrap(db().from('applications').insert(rows).select());
}

export function updateApplication(id, patch) {
  return unwrap(db().from('applications').update(patch).eq('id', id).select().single());
}

export function deleteApplication(id) {
  return unwrap(db().from('applications').delete().eq('id', id));
}

export function listEvents(applicationId) {
  return unwrap(
    db()
      .from('application_events')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false }),
  );
}

export function listAllEvents() {
  return fetchAll('application_events', 'id, application_id, to_status, created_at');
}

// ------------------------------------------------------------------ templates

export function listTemplates() {
  return unwrap(db().from('templates').select('*').order('created_at', { ascending: true }));
}

export function createTemplates(rows) {
  return unwrap(db().from('templates').insert(rows).select());
}

export function updateTemplate(id, patch) {
  return unwrap(db().from('templates').update(patch).eq('id', id).select().single());
}

export function deleteTemplate(id) {
  return unwrap(db().from('templates').delete().eq('id', id));
}

// ------------------------------------------------------------------ alert keywords

export function listKeywords() {
  return unwrap(db().from('alert_keywords').select('*').order('created_at', { ascending: true }));
}

export function createKeywords(rows) {
  return unwrap(db().from('alert_keywords').insert(rows).select());
}

export function updateKeyword(id, patch) {
  return unwrap(db().from('alert_keywords').update(patch).eq('id', id).select().single());
}

export function deleteKeyword(id) {
  return unwrap(db().from('alert_keywords').delete().eq('id', id));
}
