import * as api from '../api.js';
import { ACTIVE_STATUSES, STATUSES } from '../constants.js';
import { CSV_COLUMNS, parseCSV, rowsToApplications, toCSV } from '../csv.js';
import { safeUrl, statusPatch } from '../logic.js';
import { el, clear, formatDateTime, guard, select, toast, todayISO } from '../ui.js';

// Filters survive tab switches.
const filters = { text: '', status: '', channel: '' };

const dupKey = (app) => `${app.company}|${app.role}`.toLowerCase();

export function renderApplications(root, ctx) {
  const { state } = ctx;
  const tbody = el('tbody');
  const counter = el('span', { class: 'muted' });

  const visible = () =>
    state.apps.filter((app) => {
      const text = filters.text.trim().toLowerCase();
      if (text && !`${app.company} ${app.role} ${app.notes ?? ''}`.toLowerCase().includes(text)) {
        return false;
      }
      if (filters.status && app.status !== filters.status) return false;
      if (filters.channel && app.channel !== filters.channel) return false;
      return true;
    });

  function drawRows() {
    clear(tbody);
    const rows = visible();
    counter.textContent = `${rows.length} de ${state.apps.length}`;
    if (!rows.length) {
      tbody.append(
        el('tr', {}, el('td', { colspan: 9, class: 'empty' }, 'No hay postulaciones para mostrar.')),
      );
      return;
    }
    for (const app of rows) tbody.append(row(app));
  }

  async function patch(app, changes) {
    const updated = await guard(() => api.updateApplication(app.id, changes));
    if (updated) Object.assign(app, updated);
    drawRows();
    ctx.refreshBadge();
  }

  function row(app) {
    const link = safeUrl(app.url);
    const due =
      app.next_follow_up && ACTIVE_STATUSES.includes(app.status) && app.next_follow_up <= todayISO();
    const statusIndex = STATUSES.indexOf(app.status);

    return el(
      'tr',
      { class: due ? 'due' : '' },
      el(
        'td',
        {},
        link
          ? el('a', { class: 'company', href: link, target: '_blank', rel: 'noopener noreferrer' }, app.company)
          : el('span', { class: 'company' }, app.company),
      ),
      el('td', {}, app.role),
      el(
        'td',
        {},
        select(STATUSES, app.status, (value) => patch(app, statusPatch(app, value, todayISO(), state.settings.follow_up_days)), {
          class: `status s${statusIndex}`,
          'aria-label': `Estado de ${app.company}`,
        }),
      ),
      el(
        'td',
        {},
        select(state.settings.channels, app.channel, (value) => patch(app, { channel: value }), {
          'aria-label': `Canal de ${app.company}`,
        }),
      ),
      el(
        'td',
        {},
        select(['', ...state.settings.cv_options], app.cv ?? '', (value) => patch(app, { cv: value || null }), {
          'aria-label': `CV para ${app.company}`,
          placeholder: 'Sin CV',
        }),
      ),
      el('td', {}, dateInput(app.applied_on, `Fecha de postulación de ${app.company}`, (v) => patch(app, { applied_on: v }))),
      el('td', {}, dateInput(app.next_follow_up, `Próximo seguimiento de ${app.company}`, (v) => patch(app, { next_follow_up: v }))),
      el(
        'td',
        {},
        el('input', {
          type: 'text',
          value: app.notes ?? '',
          'aria-label': `Notas de ${app.company}`,
          onChange: (event) => patch(app, { notes: event.target.value.trim() || null }),
        }),
      ),
      el(
        'td',
        { class: 'row-actions' },
        el('button', { class: 'btn ghost small', type: 'button', onClick: () => showHistory(app) }, 'Historial'),
        ' ',
        el('button', { class: 'btn danger small', type: 'button', onClick: () => remove(app) }, 'Borrar'),
      ),
    );
  }

  function dateInput(value, label, onChange) {
    return el('input', {
      type: 'date',
      value: value ?? '',
      'aria-label': label,
      onChange: (event) => onChange(event.target.value || null),
    });
  }

  async function remove(app) {
    if (!window.confirm(`¿Borrar "${app.company} - ${app.role}"? No se puede deshacer.`)) return;
    const ok = await guard(() => api.deleteApplication(app.id), 'Postulación borrada');
    if (ok !== undefined) {
      state.apps = state.apps.filter((item) => item.id !== app.id);
      drawRows();
      ctx.refreshBadge();
    }
  }

  async function showHistory(app) {
    const events = await guard(() => api.listEvents(app.id));
    if (!events) return;
    const dialog = el(
      'dialog',
      { class: 'modal' },
      el('h2', {}, `Historial: ${app.company}`),
      events.length
        ? el(
            'ul',
            { class: 'timeline' },
            events.map((event) =>
              el(
                'li',
                {},
                el('time', {}, formatDateTime(event.created_at)),
                event.from_status ? `${event.from_status} → ${event.to_status}` : `Creada como ${event.to_status}`,
              ),
            ),
          )
        : el('p', { class: 'muted' }, 'Todavía no hay cambios registrados.'),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', onClick: () => dialog.close() }, 'Cerrar')),
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  function showAddDialog() {
    const field = (label, input, wide = false) =>
      el('label', { class: wide ? 'field wide' : 'field' }, el('span', {}, label), input);
    const noop = () => {};

    const form = el(
      'form',
      { class: 'form-grid' },
      field('Empresa *', el('input', { type: 'text', name: 'company', required: true })),
      field('Puesto *', el('input', { type: 'text', name: 'role', required: true })),
      field('Estado', select(STATUSES, 'Pendiente', noop, { name: 'status' })),
      field('Canal', select(state.settings.channels, state.settings.channels[0], noop, { name: 'channel' })),
      field('CV a enviar', select(['', ...state.settings.cv_options], '', noop, { name: 'cv', placeholder: 'Sin CV' })),
      field('Enlace del aviso', el('input', { type: 'url', name: 'url', placeholder: 'https://' })),
      field('Notas', el('input', { type: 'text', name: 'notes' }), true),
      el(
        'div',
        { class: 'actions wide' },
        el('button', { class: 'btn', type: 'submit' }, 'Agregar'),
        el('button', { class: 'btn ghost', type: 'button', onClick: () => dialog.close() }, 'Cancelar'),
      ),
    );

    const dialog = el('dialog', { class: 'modal' }, el('h2', {}, 'Nueva postulación'), form);
    dialog.addEventListener('close', () => dialog.remove());

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const text = (name) => String(data.get(name) ?? '').trim();
      const status = text('status');
      const newRow = {
        company: text('company'),
        role: text('role'),
        channel: text('channel'),
        cv: text('cv') || null,
        url: text('url') || null,
        notes: text('notes') || null,
        ...statusPatch({}, status, todayISO(), state.settings.follow_up_days),
      };
      const created = await guard(() => api.createApplications([newRow]), 'Postulación agregada');
      if (created) {
        state.apps = [...created, ...state.apps];
        dialog.close();
        drawRows();
        ctx.refreshBadge();
      }
    });

    document.body.append(dialog);
    dialog.showModal();
  }

  function exportCSV() {
    const rows = [CSV_COLUMNS, ...state.apps.map((app) => CSV_COLUMNS.map((col) => app[col] ?? ''))];
    const blob = new Blob(['﻿', toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = el('a', { href, download: `postulaciones-${todayISO()}.csv` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function importCSV(file) {
    const incoming = rowsToApplications(parseCSV(await file.text()));
    if (!incoming.length) {
      toast('No encontré filas válidas. Revisá que tenga las columnas company y role.', 'error');
      return;
    }
    const known = new Set(state.apps.map(dupKey));
    const fresh = incoming.filter((app) => !known.has(dupKey(app)));
    if (!fresh.length) {
      toast(`Las ${incoming.length} filas ya existían. No se importó nada.`);
      return;
    }
    const created = await guard(
      () => api.createApplications(fresh),
      `${fresh.length} postulaciones importadas (${incoming.length - fresh.length} ya existían)`,
    );
    if (created) {
      state.apps = [...created, ...state.apps];
      drawRows();
      ctx.refreshBadge();
    }
  }

  const fileInput = el('input', {
    type: 'file',
    accept: '.csv,text/csv',
    hidden: true,
    'aria-label': 'Importar CSV',
    onChange: (event) => {
      const [file] = event.target.files;
      event.target.value = '';
      if (file) importCSV(file);
    },
  });

  const toolbar = el(
    'div',
    { class: 'toolbar' },
    el('input', {
      class: 'grow',
      type: 'search',
      placeholder: 'Buscar empresa, puesto o nota',
      value: filters.text,
      'aria-label': 'Buscar',
      onInput: (event) => {
        filters.text = event.target.value;
        drawRows();
      },
    }),
    select(['', ...STATUSES], filters.status, (value) => {
      filters.status = value;
      drawRows();
    }, { 'aria-label': 'Filtrar por estado', placeholder: 'Todos los estados' }),
    select(['', ...state.settings.channels], filters.channel, (value) => {
      filters.channel = value;
      drawRows();
    }, { 'aria-label': 'Filtrar por canal', placeholder: 'Todos los canales' }),
    counter,
    el('button', { class: 'btn', type: 'button', onClick: showAddDialog }, 'Agregar'),
    el('button', { class: 'btn ghost', type: 'button', onClick: () => fileInput.click() }, 'Importar CSV'),
    el('button', { class: 'btn ghost', type: 'button', onClick: exportCSV }, 'Exportar CSV'),
    fileInput,
  );

  const header = ['Empresa', 'Puesto', 'Estado', 'Canal', 'CV', 'Postulada', 'Seguimiento', 'Notas', ''];
  const table = el(
    'div',
    { class: 'table-wrap' },
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, header.map((name) => el('th', { scope: 'col' }, name)))),
      tbody,
    ),
  );

  root.append(toolbar, table);
  drawRows();
}
