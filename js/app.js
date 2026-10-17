import * as api from './api.js';
import { CHANNELS, CV_OPTIONS, DEFAULT_KEYWORDS, DEFAULT_TEMPLATES, FOLLOW_UP_DAYS, PRIVACY_VERSION } from './constants.js';
import { dueCount } from './logic.js';
import { clear, el, guard, todayISO, toast } from './ui.js';
import { renderAlerts } from './views/alerts.js';
import { renderApplications } from './views/applications.js';
import { showConsent, showForgot, showLogin, showRecovery, showRegister } from './views/auth.js';
import { renderFunnel } from './views/funnel.js';
import { renderReminders } from './views/reminders.js';
import { renderSettings } from './views/settings.js';
import { renderTemplates } from './views/templates.js';

// Read before supabase-js starts: it removes the token from the address bar once it has used it.
const openedFromRecoveryLink = /type=recovery/.test(window.location.hash);
const urlProblem = readUrlProblem();

const TABS = [
  { id: 'applications', label: 'Postulaciones', render: renderApplications },
  { id: 'funnel', label: 'Embudo', render: renderFunnel },
  { id: 'reminders', label: 'Recordatorios', render: renderReminders },
  { id: 'templates', label: 'Plantillas', render: renderTemplates },
  { id: 'alerts', label: 'Alertas', render: renderAlerts },
  { id: 'settings', label: 'Ajustes', render: renderSettings },
];

function defaultSettings() {
  return { channels: [...CHANNELS], cv_options: [...CV_OPTIONS], follow_up_days: FOLLOW_UP_DAYS };
}

function initialState() {
  return {
    session: null,
    recovering: openedFromRecoveryLink,
    apps: [],
    templates: [],
    keywords: [],
    settings: defaultSettings(),
    tab: 'applications',
    templateAppId: '',
  };
}

const state = initialState();

/** Clears everything held in memory, so the next person on this browser never sees the previous data. */
function resetState() {
  Object.assign(state, initialState(), { recovering: false });
}

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const tabsNav = document.getElementById('tabs');
let renderToken = 0;

const ctx = {
  state,
  go(tab) {
    state.tab = tab;
    render();
  },
  refresh() {
    render();
  },
  refreshBadge: drawTabs,
  reload: () => load(),
  signOut: () => signOutNow(),
  accountDeleted() {
    resetState();
    nav.login('Tu cuenta y todos tus datos fueron eliminados.');
  },
};

// ------------------------------------------------------------------ rendering

function drawTabs() {
  clear(tabsNav);
  const due = dueCount(state.apps, todayISO());
  for (const tab of TABS) {
    tabsNav.append(
      el(
        'button',
        {
          class: 'tab',
          type: 'button',
          'aria-current': tab.id === state.tab ? 'page' : null,
          onClick: () => ctx.go(tab.id),
        },
        tab.label,
        tab.id === 'reminders' && due > 0 && el('span', { class: 'badge', title: 'Seguimientos para hoy o vencidos' }, due),
      ),
    );
  }
}

async function render() {
  drawTabs();
  const token = (renderToken += 1);
  const tab = TABS.find((item) => item.id === state.tab) ?? TABS[0];
  const panel = el('div', { class: 'panel' });
  try {
    await tab.render(panel, ctx);
  } catch (error) {
    toast(error.message || 'No se pudo mostrar la pantalla', 'error');
  }
  // Ignore the result if the user already switched to another tab.
  if (token !== renderToken) return;
  clear(view);
  view.append(panel);
}

// ------------------------------------------------------------------ screens without a session

function showCard(title, ...content) {
  topbar.hidden = true;
  clear(view);
  view.append(el('section', { class: 'card center-card' }, el('h2', {}, title), ...content));
}

const nav = {
  login: (message = '') => showLogin(showCard, nav, message),
  register: () => showRegister(showCard, nav),
  forgot: () => showForgot(showCard, nav),
};

function showSetup() {
  showCard(
    'Falta configurar Supabase',
    el('p', {}, 'Abrí js/config.js y pegá la Project URL y la publishable key de tu proyecto de Supabase.'),
    el('p', { class: 'muted' }, 'Los pasos completos están en el README.'),
  );
}

/** Links from emails that failed (expired, already used) come back with the reason in the address. */
function readUrlProblem() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('error_code');
  if (!code && !params.get('error')) return '';
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return code === 'otp_expired'
    ? 'El enlace venció o ya se usó. Pedí uno nuevo.'
    : 'El enlace no es válido. Pedí uno nuevo.';
}

// ------------------------------------------------------------------ session lifecycle

/**
 * First run = no settings row yet. The row doubles as the "already seeded" marker, so
 * deleting templates or keywords later never brings the defaults back.
 */
async function firstRunSetup() {
  if (!state.templates.length) state.templates = await api.createTemplates(DEFAULT_TEMPLATES);
  if (!state.keywords.length) state.keywords = await api.createKeywords(DEFAULT_KEYWORDS);
  return api.saveSettings(state.session.user.id, defaultSettings());
}

async function load() {
  const loaded = await guard(async () => {
    const [apps, templates, keywords, settings] = await Promise.all([
      api.listApplications(),
      api.listTemplates(),
      api.listKeywords(),
      api.getSettings(),
    ]);
    Object.assign(state, { apps, templates, keywords });
    state.settings = settings ?? (await firstRunSetup());
    return true;
  });
  if (!loaded) return;
  document.getElementById('user-email').textContent = state.session.user.email ?? '';
  topbar.hidden = false;
  render();
}

/** Signed in: ask for consent to the current privacy notice first, then load the data. */
async function enter(session) {
  if (state.recovering) return;
  state.session = session;
  const accepted = await guard(async () => {
    const consents = await api.listConsents();
    return consents.some((consent) => consent.policy_version === PRIVACY_VERSION);
  });
  if (accepted === undefined) return;
  if (!accepted) {
    showConsent(showCard, { email: session.user.email ?? '', onAccept: () => load(), onSignOut: () => signOutNow() });
    return;
  }
  await load();
}

function showRecoveryScreen() {
  showRecovery(showCard, () => {
    state.recovering = false;
    toast('Contraseña actualizada');
    enter(state.session);
  });
}

async function signOutNow() {
  await guard(() => api.signOut());
  resetState();
  nav.login();
}

document.getElementById('signout').addEventListener('click', () => signOutNow());

function handleAuthEvent(event, session) {
  // Everything below is deferred: supabase-js can deadlock if its own calls are awaited inside this callback.
  if (event === 'PASSWORD_RECOVERY') {
    state.recovering = true;
    state.session = session;
    setTimeout(showRecoveryScreen, 0);
    return;
  }
  if (session && session.user.id !== state.session?.user.id) {
    setTimeout(() => enter(session), 0);
  }
  if (!session && state.session) {
    resetState();
    nav.login();
  }
}

async function boot() {
  if (!api.isConfigured()) {
    showSetup();
    return;
  }
  try {
    const session = await api.getSession();
    api.onAuthChange(handleAuthEvent);
    if (session && state.recovering) {
      state.session = session;
      showRecoveryScreen();
    } else if (session) {
      await enter(session);
    } else {
      state.recovering = false;
      nav.login(urlProblem);
    }
  } catch (error) {
    nav.login(error.message);
  }
}

boot();
