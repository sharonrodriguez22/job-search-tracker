import * as api from '../api.js';
import { buildExport, mergeOptions, onlyNew, parseImport } from '../portability.js';
import { clear, downloadFile, el, guard, toast, todayISO } from '../ui.js';

const MAX_ITEM_LENGTH = 40;
const MAX_ITEMS = 30;
const MIN_PASSWORD_LENGTH = 10;

export function renderSettings(root, ctx) {
  const { state } = ctx;

  async function save(patch, message) {
    const saved = await guard(() => api.saveSettings(state.session.user.id, patch), message);
    if (saved) Object.assign(state.settings, saved);
    return Boolean(saved);
  }

  /** Editable list of options (channels, CV types). Removing one never touches existing applications. */
  function listEditor(title, hint, key) {
    const items = state.settings[key];
    const input = el('input', { type: 'text', maxLength: MAX_ITEM_LENGTH, placeholder: 'Agregar opción', 'aria-label': `Agregar a ${title}` });
    const form = el('form', { class: 'toolbar' }, input, el('button', { class: 'btn', type: 'submit' }, 'Agregar'));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      if (items.some((item) => item.toLowerCase() === value.toLowerCase())) {
        toast('Esa opción ya existe.', 'error');
        return;
      }
      if (items.length >= MAX_ITEMS) {
        toast(`El máximo es ${MAX_ITEMS} opciones.`, 'error');
        return;
      }
      if (await save({ [key]: [...items, value] }, 'Guardado')) draw();
    });

    return el(
      'section',
      { class: 'card' },
      el('h2', {}, title),
      el('p', { class: 'muted' }, hint),
      el(
        'ul',
        { class: 'list' },
        items.map((item) =>
          el(
            'li',
            {},
            el('span', { class: 'grow kw' }, item),
            el(
              'button',
              {
                class: 'btn danger small',
                type: 'button',
                disabled: items.length <= 1,
                'aria-label': `Quitar ${item}`,
                onClick: async () => {
                  if (await save({ [key]: items.filter((other) => other !== item) }, 'Guardado')) draw();
                },
              },
              'Quitar',
            ),
          ),
        ),
      ),
      form,
    );
  }

  function followUpSection() {
    const input = el('input', { type: 'number', min: 1, max: 60, value: state.settings.follow_up_days, 'aria-label': 'Días hasta el seguimiento' });
    return el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Días hasta el seguimiento'),
      el('p', { class: 'muted' }, 'Cuántos días esperar antes de sugerir un seguimiento. Aplica a los cambios de estado que hagas desde ahora.'),
      el(
        'div',
        { class: 'toolbar' },
        input,
        el(
          'button',
          {
            class: 'btn',
            type: 'button',
            onClick: async () => {
              const days = Number(input.value);
              if (!Number.isInteger(days) || days < 1 || days > 60) {
                toast('Ingresá un número entero entre 1 y 60.', 'error');
                return;
              }
              await save({ follow_up_days: days }, 'Guardado');
            },
          },
          'Guardar',
        ),
      ),
    );
  }

  function passwordSection() {
    const first = el('input', { type: 'password', autocomplete: 'new-password', minLength: MIN_PASSWORD_LENGTH, required: true });
    const second = el('input', { type: 'password', autocomplete: 'new-password', minLength: MIN_PASSWORD_LENGTH, required: true });
    const form = el(
      'form',
      { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', {}, 'Nueva contraseña'), first),
      el('label', { class: 'field' }, el('span', {}, 'Repetir contraseña'), second),
      el('div', { class: 'actions wide' }, el('button', { class: 'btn', type: 'submit' }, 'Cambiar contraseña')),
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (first.value.length < MIN_PASSWORD_LENGTH) {
        toast(`Usá al menos ${MIN_PASSWORD_LENGTH} caracteres.`, 'error');
        return;
      }
      if (first.value !== second.value) {
        toast('Las contraseñas no coinciden.', 'error');
        return;
      }
      const ok = await guard(() => api.updatePassword(first.value), 'Contraseña actualizada');
      if (ok !== undefined) form.reset();
    });
    return el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Cuenta'),
      el('p', { class: 'muted' }, `Sesión: ${state.session.user.email ?? ''} · `, el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener noreferrer' }, 'Aviso de privacidad')),
      form,
    );
  }

  // ---- export, import

  function dataSection() {
    const result = el('div', { 'aria-live': 'polite' });

    async function exportJSON() {
      const data = await guard(() => api.exportAll());
      if (!data) return;
      const payload = buildExport({ email: state.session.user.email ?? '', data });
      downloadFile(`mis-datos-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      toast('Archivo descargado');
    }

    async function importJSON(file) {
      clear(result);
      let parsed;
      try {
        parsed = parseImport(await file.text());
      } catch (error) {
        toast(error.message, 'error');
        return;
      }
      const newApps = onlyNew(state.apps, parsed.applications, (a) => `${a.company}|${a.role}`);
      const newTemplates = onlyNew(state.templates, parsed.templates, (t) => t.name);
      const newKeywords = onlyNew(state.keywords, parsed.keywords, (k) => `${k.kind}|${k.keyword}`);
      const total = newApps.length + newTemplates.length + newKeywords.length;
      const summary = `${newApps.length} postulaciones, ${newTemplates.length} plantillas y ${newKeywords.length} palabras clave nuevas`;
      if (!total && !parsed.settings) {
        toast('No hay nada nuevo para importar.');
        return;
      }
      if (!window.confirm(`Se importarán ${summary}. Lo que ya existe no se duplica. ¿Continuar?`)) return;

      const failed = await guard(async () => {
        if (newApps.length) state.apps = [...(await api.createApplications(newApps)), ...state.apps];
        if (newTemplates.length) state.templates = [...state.templates, ...(await api.createTemplates(newTemplates))];
        if (newKeywords.length) state.keywords = [...state.keywords, ...(await api.createKeywords(newKeywords))];
        if (parsed.settings) {
          const patch = {};
          if (parsed.settings.channels) patch.channels = mergeOptions(state.settings.channels, parsed.settings.channels);
          if (parsed.settings.cv_options) patch.cv_options = mergeOptions(state.settings.cv_options, parsed.settings.cv_options);
          if (parsed.settings.follow_up_days) patch.follow_up_days = parsed.settings.follow_up_days;
          if (Object.keys(patch).length) {
            Object.assign(state.settings, await api.saveSettings(state.session.user.id, patch));
          }
        }
        return true;
      });
      if (failed === undefined) return;
      ctx.refreshBadge();
      toast('Importación lista');
      result.append(
        el('p', {}, `Importado: ${summary}.`),
        parsed.warnings.length &&
          el('details', {}, el('summary', {}, `${parsed.warnings.length} avisos`), el('ul', {}, parsed.warnings.map((w) => el('li', {}, w)))),
      );
    }

    const fileInput = el('input', {
      type: 'file',
      accept: '.json,application/json',
      hidden: true,
      'aria-label': 'Importar archivo JSON',
      onChange: (event) => {
        const [file] = event.target.files;
        event.target.value = '';
        if (file) importJSON(file);
      },
    });

    return el(
      'section',
      { class: 'card' },
      el('h2', {}, 'Mis datos'),
      el(
        'p',
        { class: 'muted' },
        'Descargá una copia de todo lo que la aplicación guarda sobre vos, o cargá un archivo con el mismo formato. Evitá escribir datos sensibles en las notas.',
      ),
      el(
        'div',
        { class: 'toolbar' },
        el('button', { class: 'btn', type: 'button', onClick: exportJSON }, 'Descargar mis datos (JSON)'),
        el('button', { class: 'btn ghost', type: 'button', onClick: () => fileInput.click() }, 'Importar archivo JSON'),
        fileInput,
      ),
      result,
    );
  }

  function dangerSection() {
    const email = state.session.user.email ?? '';
    const confirmInput = el('input', { type: 'email', autocomplete: 'off', placeholder: email, 'aria-label': 'Escribí tu email para confirmar' });
    const button = el('button', { class: 'btn danger', type: 'button', disabled: true }, 'Eliminar mi cuenta y mis datos');
    confirmInput.addEventListener('input', () => {
      button.disabled = confirmInput.value.trim().toLowerCase() !== email.toLowerCase();
    });
    button.addEventListener('click', async () => {
      if (!window.confirm('Se borran tu cuenta y todos tus datos. No se puede deshacer. ¿Seguro?')) return;
      const ok = await guard(() => api.deleteAccount());
      if (ok === undefined) return;
      try {
        await api.signOut();
      } catch {
        // The account no longer exists, so the server may refuse to close the session; the local one is cleared anyway.
      }
      ctx.accountDeleted();
    });
    return el(
      'section',
      { class: 'card danger-zone' },
      el('h2', {}, 'Eliminar mi cuenta'),
      el(
        'p',
        { class: 'muted' },
        'Borra tu cuenta y todo lo asociado: postulaciones, historial, plantillas, palabras clave, ajustes y registros de consentimiento. Antes podés descargar tus datos.',
      ),
      el('div', { class: 'toolbar' }, confirmInput, button),
      el('p', { class: 'muted small' }, 'Para confirmar, escribí tu email.'),
    );
  }

  function draw() {
    clear(root);
    root.append(
      listEditor('Canales', 'Por dónde encontrás o enviás cada postulación. Si quitás uno, las postulaciones que ya lo usan lo conservan.', 'channels'),
      listEditor('Tipos de CV', 'Las versiones de CV que tenés. Aparecen en la columna CV.', 'cv_options'),
      followUpSection(),
      passwordSection(),
      dataSection(),
      dangerSection(),
    );
  }

  draw();
}
