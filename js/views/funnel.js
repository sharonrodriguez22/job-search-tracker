import * as api from '../api.js';
import { funnelStats } from '../logic.js';
import { el, guard } from '../ui.js';

function bar(percent) {
  const fill = el('span');
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  return el('div', { class: 'bar' }, fill);
}

export async function renderFunnel(root, ctx) {
  const events = await guard(() => api.listAllEvents());
  if (!events) return;

  const { stages, byStatus, byChannel } = funnelStats(ctx.state.apps, events, ctx.state.settings.channels);
  const maxStatus = Math.max(1, ...byStatus.map((item) => item.count));

  const stageCards = stages.map((stage, index) => {
    const previous = index > 0 ? stages[index - 1].count : null;
    const note =
      previous === null
        ? 'Postulaciones enviadas'
        : previous
          ? `${Math.round((stage.count / previous) * 100)}% de ${stages[index - 1].label.toLowerCase()}`
          : '-';
    return el(
      'div',
      { class: 'card stage' },
      el('div', { class: 'muted' }, stage.label),
      el('div', { class: 'num' }, stage.count),
      el('div', { class: 'muted' }, note),
    );
  });

  const statusBars = byStatus.map((item) =>
    el(
      'div',
      { class: 'bar-row' },
      el('span', {}, item.status),
      bar((item.count / maxStatus) * 100),
      el('span', {}, item.count),
    ),
  );

  const channelTable = byChannel.length
    ? el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          {},
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              ['Canal', 'Aplicadas', 'Con respuesta', 'Entrevistas', 'Ofertas', '% respuesta'].map((name) =>
                el('th', { scope: 'col' }, name),
              ),
            ),
          ),
          el(
            'tbody',
            {},
            byChannel.map((item) =>
              el(
                'tr',
                {},
                el('td', {}, item.channel),
                el('td', {}, item.applied),
                el('td', {}, item.response),
                el('td', {}, item.interview),
                el('td', {}, item.offer),
                el('td', {}, item.rate === null ? '-' : `${item.rate}%`),
              ),
            ),
          ),
        ),
      )
    : el('p', { class: 'muted' }, 'Todavía no hay postulaciones por canal.');

  root.append(
    el('div', { class: 'stage-grid' }, stageCards),
    el('section', { class: 'card' }, el('h2', {}, 'Por estado actual'), statusBars),
    el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Por canal'),
      channelTable,
      el(
        'p',
        { class: 'muted' },
        'Una postulación cuenta como entrevistada aunque después se haya descartado, porque se usa el historial de estados.',
      ),
    ),
  );
}
