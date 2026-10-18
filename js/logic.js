// Pure business logic (no DOM, no network) so it is easy to reason about and test.

import { ACTIVE_STATUSES, CHANNELS, FOLLOW_UP_DAYS, STATUSES } from './constants.js';
import { addDays, formatDate } from './ui.js';

/** Returns the URL only if it is a plain http(s) link, otherwise null. */
export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Changes to apply when the status of an application changes.
 * - Postulada sets the application date if missing.
 * - Active statuses get a follow-up date if missing.
 * - Closing statuses clear the follow-up date.
 */
export function statusPatch(app, status, today, followUpDays = FOLLOW_UP_DAYS) {
  const patch = { status };
  if (status === 'Postulada' && !app.applied_on) patch.applied_on = today;
  if (ACTIVE_STATUSES.includes(status)) {
    if (!app.next_follow_up) patch.next_follow_up = addDays(today, followUpDays);
  } else if (['Oferta', 'Descartada', 'Aviso cerrado'].includes(status)) {
    patch.next_follow_up = null;
  }
  return patch;
}

export function reminderGroups(apps, today) {
  const limit = addDays(today, 7);
  const active = apps.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const dated = active
    .filter((a) => a.next_follow_up)
    .sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up));
  return {
    overdue: dated.filter((a) => a.next_follow_up < today),
    today: dated.filter((a) => a.next_follow_up === today),
    upcoming: dated.filter((a) => a.next_follow_up > today && a.next_follow_up <= limit),
    undated: active.filter((a) => !a.next_follow_up),
  };
}

export function dueCount(apps, today) {
  const groups = reminderGroups(apps, today);
  return groups.overdue.length + groups.today.length;
}

/** Replaces [puesto], [empresa] and [fecha]. [Nombre] is intentionally left for the user. */
export function fillTemplate(text, app) {
  if (!app) return text;
  return text
    .replaceAll('[puesto]', () => app.role)
    .replaceAll('[empresa]', () => app.company)
    .replaceAll('[fecha]', () => (app.applied_on ? formatDate(app.applied_on) : '[fecha]'));
}

/**
 * Funnel built from the current status plus the full status history, so an
 * application that was interviewed and later discarded still counts as interviewed.
 * Stages cascade: an offer implies an interview, which implies a response, which implies applied.
 */
export function funnelStats(apps, events, channelList = CHANNELS) {
  const seen = new Map();
  for (const event of events) {
    if (!seen.has(event.application_id)) seen.set(event.application_id, new Set());
    seen.get(event.application_id).add(event.to_status);
  }

  const rows = apps.map((app) => {
    const states = new Set(seen.get(app.id) ?? []);
    states.add(app.status);
    const offer = states.has('Oferta');
    const interview = offer || states.has('Entrevista');
    const response = interview || states.has('En proceso');
    const applied = response || states.has('Postulada') || Boolean(app.applied_on);
    return { app, applied, response, interview, offer };
  });

  const count = (key) => rows.filter((row) => row[key]).length;
  const stages = [
    { key: 'applied', label: 'Aplicadas', count: count('applied') },
    { key: 'response', label: 'Con respuesta', count: count('response') },
    { key: 'interview', label: 'Entrevistas', count: count('interview') },
    { key: 'offer', label: 'Ofertas', count: count('offer') },
  ];

  const byStatus = STATUSES.map((status) => ({
    status,
    count: apps.filter((app) => app.status === status).length,
  }));

  const channels = [...new Set([...channelList, ...apps.map((app) => app.channel)])];
  const byChannel = channels
    .map((channel) => {
      const subset = rows.filter((row) => row.app.channel === channel);
      const applied = subset.filter((row) => row.applied).length;
      const response = subset.filter((row) => row.response).length;
      return {
        channel,
        total: subset.length,
        applied,
        response,
        interview: subset.filter((row) => row.interview).length,
        offer: subset.filter((row) => row.offer).length,
        rate: applied ? Math.round((response / applied) * 100) : null,
      };
    })
    .filter((row) => row.total > 0);

  return { stages, byStatus, byChannel };
}

/** Area to assume for rows that come without one (old files): pharmacy and administrative CVs go to Farmacia. */
export function areaFromCv(cv) {
  return cv === 'Farmacia' || cv === 'Administrativo' ? 'Farmacia' : 'Tech';
}
