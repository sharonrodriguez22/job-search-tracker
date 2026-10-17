import * as api from '../api.js';
import { reminderGroups } from '../logic.js';
import { addDays, el, formatDate, guard, todayISO } from '../ui.js';

export function renderReminders(root, ctx) {
  const { state } = ctx;
  const today = todayISO();
  const days = state.settings.follow_up_days;
  const groups = reminderGroups(state.apps, today);

  async function reschedule(app, date, message) {
    const updated = await guard(() => api.updateApplication(app.id, { next_follow_up: date }), message);
    if (updated) {
      Object.assign(app, updated);
      ctx.refresh();
    }
  }

  function item(app, withDate) {
    return el(
      'li',
      {},
      el(
        'div',
        { class: 'grow' },
        el('div', { class: 'kw' }, `${app.company} - ${app.role}`),
        el('div', { class: 'muted' }, withDate ? `${app.status} · seguimiento ${formatDate(app.next_follow_up)}` : app.status),
      ),
      el(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onClick: () => reschedule(app, addDays(today, days), `Próximo seguimiento en ${days} días`),
        },
        withDate ? `Hecho, +${days} días` : `Fijar +${days} días`,
      ),
      el(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          onClick: () => {
            state.templateAppId = app.id;
            ctx.go('templates');
          },
        },
        'Armar mensaje',
      ),
      withDate &&
        el(
          'button',
          { class: 'btn ghost small', type: 'button', onClick: () => reschedule(app, null, 'Seguimiento quitado') },
          'Sin seguimiento',
        ),
    );
  }

  function section(title, apps, withDate, emptyText) {
    return el(
      'section',
      { class: 'card' },
      el('h2', {}, `${title} (${apps.length})`),
      apps.length
        ? el('ul', { class: 'list' }, apps.map((app) => item(app, withDate)))
        : el('p', { class: 'muted' }, emptyText),
    );
  }

  root.append(
    section('Vencidos', groups.overdue, true, 'No hay seguimientos vencidos.'),
    section('Para hoy', groups.today, true, 'Nada para hoy.'),
    section('Próximos 7 días', groups.upcoming, true, 'Nada en los próximos 7 días.'),
    section(
      'Activas sin fecha de seguimiento',
      groups.undated,
      false,
      'Todas las postulaciones activas tienen fecha.',
    ),
    el(
      'p',
      { class: 'muted' },
      'Solo se recuerdan las postulaciones en estado Postulada, En proceso o Entrevista. Este tablero no envía mensajes: el envío es siempre manual.',
    ),
  );
}
