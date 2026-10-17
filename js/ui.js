// Small DOM helpers. Data is always inserted as text nodes (never as HTML) to avoid XSS.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

export function select(options, value, onChange, props = {}) {
  const { placeholder = '', ...rest } = props;
  const node = el('select', rest);
  for (const option of options) {
    node.append(el('option', { value: option, selected: option === value }, option || placeholder));
  }
  if (value && !options.includes(value)) {
    node.prepend(el('option', { value, selected: true }, value));
  }
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

let toastTimer = null;

export function toast(message, kind = 'info') {
  const host = document.getElementById('toast');
  host.textContent = message;
  host.dataset.kind = kind;
  host.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    host.hidden = true;
  }, 3500);
}

export async function guard(task, successMessage) {
  try {
    const result = await task();
    if (successMessage) toast(successMessage);
    return result;
  } catch (error) {
    toast(error.message || 'Ocurrió un error', 'error');
    return undefined;
  }
}

// ------------------------------------------------------------------ dates (local time, ISO yyyy-mm-dd)

export function todayISO() {
  const d = new Date();
  return toISO(d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Saves text as a file through the browser's download mechanism. */
export function downloadFile(name, text, type) {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const link = el('a', { href, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
