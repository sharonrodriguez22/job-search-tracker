// Screens shown while there is no session: sign in, sign up, forgot password, set a new
// password after a recovery link, and the privacy-notice consent gate.
// Every function receives `showCard(title, ...nodes)` from app.js, which mounts the card.

import * as api from '../api.js';
import { PRIVACY_VERSION } from '../constants.js';
import { el } from '../ui.js';

export const MIN_PASSWORD_LENGTH = 10;
export const PRIVACY_URL = 'privacy.html';

/** Turns raw auth errors into short Spanish messages. Unknown errors are shown as they are. */
export function authMessage(error) {
  const text = error?.message ?? '';
  if (/invalid login credentials/i.test(text)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(text)) return 'Falta confirmar tu correo. Abrí el enlace que te enviamos.';
  if (/rate limit|too many|security purposes/i.test(text)) {
    return 'Se alcanzó el límite de intentos o de correos. Esperá un rato y probá de nuevo.';
  }
  if (/signups? not allowed|sign.?ups? (are )?disabled/i.test(text)) return 'Por ahora no se aceptan cuentas nuevas.';
  if (/same password|different from the old/i.test(text)) return 'La nueva contraseña tiene que ser distinta de la anterior.';
  if (/weak|at least \d+ characters|password should/i.test(text)) return 'Esa contraseña no cumple los requisitos. Probá con una más larga.';
  return text || 'Ocurrió un error. Probá de nuevo.';
}

function privacyLink(label = 'Aviso de privacidad') {
  return el('a', { href: PRIVACY_URL, target: '_blank', rel: 'noopener noreferrer' }, label);
}

const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);

const linkButton = (label, onClick) => el('button', { class: 'link-btn', type: 'button', onClick }, label);

/** Runs a submit handler with the button disabled and any error written into the status line. */
function onSubmit(form, submit, status, handler) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = '';
    try {
      await handler();
    } catch (error) {
      status.textContent = authMessage(error);
    } finally {
      submit.disabled = false;
    }
  });
}

export function showLogin(showCard, nav, message = '') {
  const email = el('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'tu@email.com' });
  const password = el('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Ingresar');
  const status = el('p', { class: 'muted', role: 'alert' }, message);
  const form = el('form', { class: 'panel' }, field('Email', email), field('Contraseña', password), submit, status);

  onSubmit(form, submit, status, async () => {
    await api.signInWithPassword(email.value.trim(), password.value);
    password.value = ''; // the auth listener starts the session
  });

  showCard(
    'Ingresar',
    form,
    el(
      'p',
      { class: 'auth-links' },
      linkButton('Crear una cuenta', () => nav.register()),
      linkButton('Olvidé mi contraseña', () => nav.forgot()),
    ),
    el('p', { class: 'muted small' }, privacyLink()),
  );
}

export function showRegister(showCard, nav) {
  const email = el('input', { type: 'email', name: 'email', required: true, autocomplete: 'email', placeholder: 'tu@email.com' });
  const first = el('input', { type: 'password', name: 'password', required: true, autocomplete: 'new-password', minLength: MIN_PASSWORD_LENGTH });
  const second = el('input', { type: 'password', name: 'password2', required: true, autocomplete: 'new-password', minLength: MIN_PASSWORD_LENGTH });
  const consent = el('input', { type: 'checkbox', name: 'consent', required: true });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Crear cuenta');
  const status = el('p', { class: 'muted', role: 'alert' });

  const form = el(
    'form',
    { class: 'panel' },
    field('Email', email),
    field(`Contraseña (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`, first),
    field('Repetir contraseña', second),
    el('label', { class: 'check' }, consent, el('span', {}, 'Leí y acepto el ', privacyLink('aviso de privacidad'), '.')),
    submit,
    status,
  );

  onSubmit(form, submit, status, async () => {
    if (first.value.length < MIN_PASSWORD_LENGTH) {
      status.textContent = `Usá al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
      return;
    }
    if (first.value !== second.value) {
      status.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    if (!consent.checked) {
      status.textContent = 'Para crear la cuenta tenés que aceptar el aviso de privacidad.';
      return;
    }
    const session = await api.signUp(email.value.trim(), first.value, PRIVACY_VERSION);
    first.value = '';
    second.value = '';
    // Same message whether or not the address already had an account: it does not reveal who is registered.
    if (!session) {
      status.textContent =
        'Listo. Si el correo es válido, te enviamos un enlace para confirmar la cuenta. Abrilo y después ingresá. Revisá también el spam.';
    }
  });

  showCard(
    'Crear una cuenta',
    el('p', { class: 'muted' }, 'Cada cuenta ve solo sus propios datos.'),
    form,
    el('p', { class: 'auth-links' }, linkButton('Ya tengo cuenta', () => nav.login())),
  );
}

export function showForgot(showCard, nav) {
  const email = el('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'tu@email.com' });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Enviarme el enlace');
  const status = el('p', { class: 'muted', role: 'alert' });
  const form = el('form', { class: 'panel' }, field('Email', email), submit, status);

  onSubmit(form, submit, status, async () => {
    await api.requestPasswordReset(email.value.trim());
    status.textContent = 'Si el correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva.';
  });

  showCard(
    'Recuperar contraseña',
    form,
    el('p', { class: 'auth-links' }, linkButton('Volver a ingresar', () => nav.login())),
  );
}

/** Shown after opening the link from the recovery email. `onDone` continues into the app. */
export function showRecovery(showCard, onDone) {
  const first = el('input', { type: 'password', required: true, autocomplete: 'new-password', minLength: MIN_PASSWORD_LENGTH });
  const second = el('input', { type: 'password', required: true, autocomplete: 'new-password', minLength: MIN_PASSWORD_LENGTH });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Guardar contraseña');
  const status = el('p', { class: 'muted', role: 'alert' });
  const form = el(
    'form',
    { class: 'panel' },
    field(`Nueva contraseña (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`, first),
    field('Repetir contraseña', second),
    submit,
    status,
  );

  onSubmit(form, submit, status, async () => {
    if (first.value.length < MIN_PASSWORD_LENGTH) {
      status.textContent = `Usá al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
      return;
    }
    if (first.value !== second.value) {
      status.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    await api.updatePassword(first.value);
    onDone();
  });

  showCard('Elegí una contraseña nueva', form);
}

/** Asks for acceptance of the current privacy notice. Nothing else is loaded until the user accepts. */
export function showConsent(showCard, { email, onAccept, onSignOut }) {
  const consent = el('input', { type: 'checkbox', name: 'consent', required: true });
  const submit = el('button', { class: 'btn', type: 'submit' }, 'Aceptar y continuar');
  const status = el('p', { class: 'muted', role: 'alert' });
  const form = el(
    'form',
    { class: 'panel' },
    el('label', { class: 'check' }, consent, el('span', {}, 'Leí y acepto el ', privacyLink('aviso de privacidad'), '.')),
    submit,
    status,
  );

  onSubmit(form, submit, status, async () => {
    if (!consent.checked) {
      status.textContent = 'Para usar la aplicación tenés que aceptar el aviso de privacidad.';
      return;
    }
    await api.acceptPrivacy(PRIVACY_VERSION);
    onAccept();
  });

  showCard(
    'Aviso de privacidad',
    el('p', {}, `Sesión: ${email}. Antes de seguir, leé y aceptá el aviso de privacidad vigente.`),
    form,
    el('p', { class: 'auth-links' }, linkButton('Salir', onSignOut)),
  );
}
