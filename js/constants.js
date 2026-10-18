// Shared constants. User-facing labels are in Spanish on purpose: the app is used in Spanish.

export const STATUSES = [
  'Pendiente',
  'Interesa',
  'Postulada',
  'En proceso',
  'Entrevista',
  'Oferta',
  'Descartada',
  'Aviso cerrado',
];

// Areas shown as separate tabs. The value is stored in the database; the label is shown.
export const AREAS = [
  { value: 'Tech', label: 'Tech (QA, Datos)' },
  { value: 'Farmacia', label: 'Farmacia / Administrativo' },
  { value: 'A confirmar', label: 'A confirmar' },
];

// Statuses in which a follow-up still makes sense.
export const ACTIVE_STATUSES = ['Postulada', 'En proceso', 'Entrevista'];

export const CHANNELS = [
  'Computrabajo',
  'LinkedIn',
  'Referido',
  'Portal de la empresa',
  'Mail directo',
  'Consultora',
  'Otro',
];

export const CV_OPTIONS = ['Administrativo', 'Farmacia', 'QA', 'Otro'];

// Days to wait before suggesting a follow-up after applying.
export const FOLLOW_UP_DAYS = 5;

// Version of the privacy notice (privacy.html). Change it whenever the notice changes in a way
// users must accept again: everyone is asked for consent on their next sign-in.
export const PRIVACY_VERSION = '2026-10-18';

// Limits shared by the forms and the JSON import. The database enforces its own limits too.
export const LIMITS = {
  company: 200,
  role: 200,
  url: 2000,
  notes: 2000,
  templateName: 100,
  templateSubject: 300,
  templateBody: 5000,
  keyword: 100,
  reason: 300,
  option: 40,
  options: 30,
  applications: 2000,
  templates: 100,
  keywords: 300,
};

// Defaults every new account starts with. Kept generic on purpose: nothing personal in here.
export const DEFAULT_TEMPLATES = [
  {
    name: 'Postulación directa por mail',
    subject: 'Postulación - [puesto]',
    body:
      'Hola [Nombre],\n\nMe postulo al puesto de [puesto]. Adjunto mi CV, donde encontrarás mi experiencia y mis datos de contacto.\n\nQuedo a disposición para una entrevista.\n\nSaludos,\n[Tu nombre]',
  },
  {
    name: 'Pedido de referencia',
    subject: '',
    body:
      'Hola [Nombre], ¿cómo estás? Vi que en [empresa] está abierta la búsqueda de [puesto] y me interesa mucho. ¿Podrías recomendarme o decirme a quién le puedo mandar mi CV? Si te sirve, te lo paso. ¡Gracias!',
  },
  {
    name: 'Seguimiento de una postulación',
    subject: 'Seguimiento de postulación - [puesto]',
    body:
      'Hola [Nombre],\n\nTe escribo por mi postulación al puesto de [puesto], que envié el [fecha]. Sigo muy interesado/a y quedo disponible para conversar. ¿Hay novedades sobre el proceso?\n\nGracias,\n[Tu nombre]',
  },
  {
    name: 'Mensaje corto (LinkedIn o WhatsApp)',
    subject: '',
    body: 'Hola [Nombre], me interesa el puesto de [puesto] en [empresa]. ¿Te puedo enviar mi CV?',
  },
  {
    name: 'Agradecimiento después de una entrevista',
    subject: 'Gracias por la entrevista - [puesto]',
    body:
      'Hola [Nombre],\n\nGracias por el tiempo que me dedicaste en la entrevista para [puesto]. Me quedé con muchas ganas de sumarme al equipo. Quedo atento/a a cualquier novedad.\n\nSaludos,\n[Tu nombre]',
  },
];

export const DEFAULT_KEYWORDS = [
  { kind: 'search', keyword: 'Tu puesto principal', reason: 'Editá esta palabra por el título que más buscás.' },
  { kind: 'search', keyword: 'Título alternativo del puesto', reason: 'Otro nombre con el que aparece tu puesto.' },
  { kind: 'review', keyword: 'Excluyente', reason: 'Revisá qué requisitos el aviso marca como excluyentes.' },
  { kind: 'review', keyword: 'Idioma', reason: 'Verificá el nivel de idioma que piden.' },
];
