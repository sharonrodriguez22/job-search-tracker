import * as api from '../api.js';
import { fillTemplate } from '../logic.js';
import { el, clear, guard, select, toast } from '../ui.js';

let selectedId = null;

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copiado`);
  } catch {
    toast('No pude copiar. Seleccioná el texto y copialo a mano.', 'error');
  }
}

export function renderTemplates(root, ctx) {
  const { state } = ctx;

  if (!state.templates.some((tpl) => tpl.id === selectedId)) {
    selectedId = state.templates[0]?.id ?? null;
  }

  function draw() {
    clear(root);
    const template = state.templates.find((tpl) => tpl.id === selectedId) ?? null;
    const app = state.apps.find((item) => item.id === state.templateAppId) ?? null;

    // ---- pickers
    const templateSelect = el(
      'select',
      {
        'aria-label': 'Plantilla',
        onChange: (event) => {
          selectedId = event.target.value;
          draw();
        },
      },
      state.templates.map((tpl) => el('option', { value: tpl.id, selected: tpl.id === selectedId }, tpl.name)),
    );

    const appSelect = el(
      'select',
      {
        'aria-label': 'Postulación',
        onChange: (event) => {
          state.templateAppId = event.target.value;
          draw();
        },
      },
      el('option', { value: '' }, 'Sin postulación (dejar [puesto] y [empresa])'),
      state.apps.map((item) =>
        el('option', { value: item.id, selected: item.id === state.templateAppId }, `${item.company} - ${item.role}`),
      ),
    );

    root.append(
      el(
        'div',
        { class: 'toolbar' },
        templateSelect,
        appSelect,
        el('button', { class: 'btn ghost', type: 'button', onClick: addTemplate }, 'Nueva plantilla'),
      ),
    );

    if (!template) {
      root.append(el('p', { class: 'muted' }, 'No hay plantillas. Creá una con "Nueva plantilla".'));
      return;
    }

    // ---- preview
    const subject = fillTemplate(template.subject ?? '', app);
    const body = fillTemplate(template.body, app);

    root.append(
      el(
        'section',
        { class: 'card' },
        el('h2', {}, 'Vista previa'),
        subject &&
          el(
            'div',
            {},
            el('h3', {}, 'Asunto'),
            el('pre', { class: 'preview' }, subject),
            el('div', { class: 'actions' }, el('button', { class: 'btn ghost small', type: 'button', onClick: () => copy(subject, 'Asunto') }, 'Copiar asunto')),
          ),
        el('h3', {}, 'Mensaje'),
        el('pre', { class: 'preview' }, body),
        el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', onClick: () => copy(body, 'Mensaje') }, 'Copiar mensaje')),
        el('p', { class: 'muted' }, '[Nombre] no se completa solo: reemplazalo a mano antes de enviar. Este tablero nunca envía mensajes.'),
      ),
    );

    // ---- editor
    const nameInput = el('input', { type: 'text', value: template.name });
    const subjectInput = el('input', { type: 'text', value: template.subject ?? '' });
    const bodyInput = el('textarea', { value: template.body });

    root.append(
      el(
        'details',
        { class: 'card' },
        el('summary', {}, 'Editar plantilla'),
        el(
          'div',
          { class: 'form-grid' },
          el('label', { class: 'field' }, el('span', {}, 'Nombre'), nameInput),
          el('label', { class: 'field' }, el('span', {}, 'Asunto'), subjectInput),
          el('label', { class: 'field wide' }, el('span', {}, 'Mensaje'), bodyInput),
        ),
        el(
          'div',
          { class: 'actions' },
          el(
            'button',
            {
              class: 'btn',
              type: 'button',
              onClick: async () => {
                if (!nameInput.value.trim() || !bodyInput.value.trim()) {
                  toast('El nombre y el mensaje no pueden quedar vacíos.', 'error');
                  return;
                }
                const updated = await guard(
                  () =>
                    api.updateTemplate(template.id, {
                      name: nameInput.value.trim(),
                      subject: subjectInput.value.trim() || null,
                      body: bodyInput.value,
                    }),
                  'Plantilla guardada',
                );
                if (updated) {
                  Object.assign(template, updated);
                  draw();
                }
              },
            },
            'Guardar',
          ),
          el(
            'button',
            {
              class: 'btn danger',
              type: 'button',
              onClick: async () => {
                if (!window.confirm(`¿Borrar la plantilla "${template.name}"?`)) return;
                const ok = await guard(() => api.deleteTemplate(template.id), 'Plantilla borrada');
                if (ok !== undefined) {
                  state.templates = state.templates.filter((tpl) => tpl.id !== template.id);
                  selectedId = state.templates[0]?.id ?? null;
                  draw();
                }
              },
            },
            'Borrar',
          ),
        ),
      ),
    );
  }

  async function addTemplate() {
    const created = await guard(
      () =>
        api.createTemplates([
          { name: 'Nueva plantilla', subject: null, body: 'Hola [Nombre],\n\n' },
        ]),
      'Plantilla creada',
    );
    if (created?.length) {
      state.templates = [...state.templates, ...created];
      selectedId = created[0].id;
      draw();
    }
  }

  draw();
}
