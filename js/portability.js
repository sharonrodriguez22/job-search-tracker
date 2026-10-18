// Export and import of a user's data as one JSON document. Pure functions: no DOM, no network.

import { AREAS, LIMITS, STATUSES } from './constants.js';
import { areaFromCv, safeUrl } from './logic.js';

export const EXPORT_FORMAT = 'job-search-tracker/export';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything the app holds about the user, as a plain object ready for JSON.stringify. */
export function buildExport({ email, data }, now = new Date()) {
  const withoutOwner = (rows) => rows.map(({ user_id: _owner, ...rest }) => rest);
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exported_at: now.toISOString(),
    account: { email },
    settings: data.user_settings[0]
      ? {
          channels: data.user_settings[0].channels,
          cv_options: data.user_settings[0].cv_options,
          follow_up_days: data.user_settings[0].follow_up_days,
        }
      : null,
    applications: withoutOwner(data.applications),
    status_history: withoutOwner(data.application_events),
    templates: withoutOwner(data.templates),
    alert_keywords: withoutOwner(data.alert_keywords),
    privacy_consents: withoutOwner(data.consents),
  };
}

function textField(value, max, warnings, label) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.length > max) {
    warnings.add(`${label} demasiado largo: se recortó a ${max} caracteres.`);
    return text.slice(0, max);
  }
  return text;
}

function optionList(value, warnings, label) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const list = [];
  for (const item of value) {
    const text = textField(item, LIMITS.option, warnings, label);
    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      list.push(text);
    }
  }
  if (list.length > LIMITS.options) warnings.add(`${label}: se tomaron solo las primeras ${LIMITS.options}.`);
  return list.slice(0, LIMITS.options);
}

function capped(list, max, warnings, label) {
  if (list.length > max) warnings.add(`${label}: se importan solo los primeros ${max}.`);
  return list.slice(0, max);
}

/**
 * Validates and cleans an exported or hand-written JSON file.
 * Returns only what is safe to insert; anything invalid is dropped and reported in `warnings`.
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('El archivo no tiene el formato esperado.');
  }

  const warnings = new Set();
  const asList = (value) => (Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : []);

  const applications = [];
  for (const row of asList(data.applications)) {
    const company = textField(row.company, LIMITS.company, warnings, 'Empresa');
    const role = textField(row.role, LIMITS.role, warnings, 'Puesto');
    if (!company || !role) {
      warnings.add('Se omitieron postulaciones sin empresa o sin puesto.');
      continue;
    }
    const url = textField(row.url, LIMITS.url, warnings, 'Enlace');
    if (url && !safeUrl(url)) warnings.add('Se quitaron enlaces que no empiezan con http o https.');
    const date = (value) => (typeof value === 'string' && DATE.test(value) ? value : null);
    const cv = textField(row.cv, LIMITS.option, warnings, 'CV') || null;
    applications.push({
      company,
      role,
      channel: textField(row.channel, LIMITS.option, warnings, 'Canal') || 'Otro',
      url: url && safeUrl(url) ? url : null,
      cv,
      area: AREAS.some((a) => a.value === row.area) ? row.area : areaFromCv(cv),
      status: STATUSES.includes(row.status) ? row.status : 'Pendiente',
      applied_on: date(row.applied_on),
      next_follow_up: date(row.next_follow_up),
      notes: textField(row.notes, LIMITS.notes, warnings, 'Notas') || null,
    });
  }

  const templates = [];
  for (const row of asList(data.templates)) {
    const name = textField(row.name, LIMITS.templateName, warnings, 'Nombre de plantilla');
    const body = textField(row.body, LIMITS.templateBody, warnings, 'Mensaje de plantilla');
    if (!name || !body) {
      warnings.add('Se omitieron plantillas sin nombre o sin mensaje.');
      continue;
    }
    templates.push({
      name,
      subject: textField(row.subject, LIMITS.templateSubject, warnings, 'Asunto') || null,
      body,
    });
  }

  const keywords = [];
  for (const row of asList(data.alert_keywords)) {
    const keyword = textField(row.keyword, LIMITS.keyword, warnings, 'Palabra');
    if (!keyword || !['search', 'review'].includes(row.kind)) {
      warnings.add('Se omitieron palabras clave inválidas.');
      continue;
    }
    keywords.push({
      kind: row.kind,
      keyword,
      reason: textField(row.reason, LIMITS.reason, warnings, 'Motivo') || null,
      done: row.done === true,
    });
  }

  let settings = null;
  if (data.settings && typeof data.settings === 'object') {
    const days = data.settings.follow_up_days;
    settings = {
      channels: optionList(data.settings.channels, warnings, 'Canales'),
      cv_options: optionList(data.settings.cv_options, warnings, 'Tipos de CV'),
      follow_up_days: Number.isInteger(days) && days >= 1 && days <= 60 ? days : null,
    };
  }

  return {
    applications: capped(applications, LIMITS.applications, warnings, 'Postulaciones'),
    templates: capped(templates, LIMITS.templates, warnings, 'Plantillas'),
    keywords: capped(keywords, LIMITS.keywords, warnings, 'Palabras clave'),
    settings,
    warnings: [...warnings],
  };
}

/** Keeps only the incoming items whose key is not already present (case-insensitive). */
export function onlyNew(existing, incoming, keyOf) {
  const known = new Set(existing.map((item) => keyOf(item).toLowerCase()));
  const result = [];
  for (const item of incoming) {
    const key = keyOf(item).toLowerCase();
    if (!known.has(key)) {
      known.add(key);
      result.push(item);
    }
  }
  return result;
}

/** Adds the new options at the end of the current list, without duplicates. */
export function mergeOptions(current, incoming) {
  const seen = new Set(current.map((value) => value.toLowerCase()));
  const merged = [...current];
  for (const value of incoming ?? []) {
    if (!seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      merged.push(value);
    }
  }
  return merged.slice(0, LIMITS.options);
}
