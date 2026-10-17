import * as api from '../api.js';
import { el, clear, guard, select, toast } from '../ui.js';

const KINDS = {
  search: {
    title: 'Palabras para buscar',
    hint: 'Tildá cada una cuando ya la buscaste hoy. "Reiniciar" las destilda todas.',
  },
  review: {
    title: 'Palabras para revisar en cada aviso',
    hint: 'Si aparecen como excluyentes, conviene pensarlo antes de postularte.',
  },
};

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado');
  } catch {
    toast('No pude copiar.', 'error');
  }
}

export function renderAlerts(root, ctx) {
  const { state } = ctx;

  function draw() {
    clear(root);

    for (const [kind, meta] of Object.entries(KINDS)) {
      const items = state.keywords.filter((item) => item.kind === kind);
      const resetButton =
        kind === 'search' &&
        el(
          'button',
          {
            class: 'btn ghost small',
            type: 'button',
            onClick: async () => {
              const pending = items.filter((item) => item.done);
              const results = await guard(() =>
                Promise.all(pending.map((item) => api.updateKeyword(item.id, { done: false }))),
              );
              if (results) {
                pending.forEach((item) => {
                  item.done = false;
                });
                draw();
              }
            },
          },
          'Reiniciar',
        );

      root.append(
        el(
          'section',
          { class: 'card' },
          el('h2', {}, `${meta.title} (${items.length})`),
          el('p', { class: 'muted' }, meta.hint),
          resetButton,
          el('ul', { class: 'list' }, items.map(keywordRow)),
        ),
      );
    }

    root.append(addForm());
  }

  function keywordRow(item) {
    return el(
      'li',
      { class: item.done ? 'done' : '' },
      el('input', {
        type: 'checkbox',
        checked: item.done,
        'aria-label': `Hecho: ${item.keyword}`,
        onChange: async (event) => {
          const updated = await guard(() => api.updateKeyword(item.id, { done: event.target.checked }));
          if (updated) Object.assign(item, updated);
          draw();
        },
      }),
      el(
        'div',
        { class: 'grow' },
        el('div', { class: 'kw' }, item.keyword),
        item.reason && el('div', { class: 'muted' }, item.reason),
      ),
      el('button', { class: 'btn ghost small', type: 'button', onClick: () => copy(item.keyword) }, 'Copiar'),
      el(
        'button',
        {
          class: 'btn danger small',
          type: 'button',
          onClick: async () => {
            const ok = await guard(() => api.deleteKeyword(item.id));
            if (ok !== undefined) {
              state.keywords = state.keywords.filter((k) => k.id !== item.id);
              draw();
            }
          },
        },
        'Borrar',
      ),
    );
  }

  function addForm() {
    const kindSelect = el(
      'select',
      { name: 'kind', 'aria-label': 'Tipo' },
      el('option', { value: 'search' }, 'Para buscar'),
      el('option', { value: 'review' }, 'Para revisar'),
    );
    const keyword = el('input', { type: 'text', name: 'keyword', required: true, placeholder: 'Palabra o frase' });
    const reason = el('input', { type: 'text', name: 'reason', placeholder: 'Motivo (opcional)' });
    const form = el(
      'form',
      { class: 'toolbar' },
      kindSelect,
      keyword,
      reason,
      el('button', { class: 'btn', type: 'submit' }, 'Agregar palabra'),
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const created = await guard(
        () =>
          api.createKeywords([
            { kind: kindSelect.value, keyword: keyword.value.trim(), reason: reason.value.trim() || null },
          ]),
        'Palabra agregada',
      );
      if (created) {
        state.keywords = [...state.keywords, ...created];
        draw();
      }
    });
    return el('section', { class: 'card' }, el('h2', {}, 'Agregar'), form);
  }

  draw();
}
