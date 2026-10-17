// Minimal CSV reader/writer (RFC 4180 quoting) used for import and export.

import { STATUSES } from './constants.js';

export const CSV_COLUMNS = [
  'company',
  'role',
  'channel',
  'url',
  'cv',
  'status',
  'applied_on',
  'next_follow_up',
  'notes',
];

export function parseCSV(text) {
  const source = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Cells starting with these characters can be run as formulas by spreadsheet apps.
const FORMULA_START = /^[=+\-@]/;

function escapeCell(value) {
  let text = String(value ?? '');
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCSV(rows) {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value) {
  const text = (value ?? '').trim().replace(/^'(?=[=+\-@])/, '');
  return text === '' ? null : text;
}

/** Turns parsed CSV rows (first row = header) into rows ready to insert. */
export function rowsToApplications(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const index = (name) => header.indexOf(name);

  return rows
    .slice(1)
    .map((cells) => {
      const get = (name) => (index(name) >= 0 ? clean(cells[index(name)]) : null);
      const status = get('status');
      const date = (name) => {
        const value = get(name);
        return value && DATE.test(value) ? value : null;
      };
      return {
        company: get('company'),
        role: get('role'),
        channel: get('channel') ?? 'Otro',
        url: get('url'),
        cv: get('cv'),
        status: STATUSES.includes(status) ? status : 'Pendiente',
        applied_on: date('applied_on'),
        next_follow_up: date('next_follow_up'),
        notes: get('notes'),
      };
    })
    .filter((app) => app.company && app.role);
}
