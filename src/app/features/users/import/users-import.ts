import { readSheet } from 'read-excel-file/browser';

import {
  CreateUserInput,
  DOCUMENT_TYPES,
  DocumentType,
  Gender,
  UserRole,
  UserStatus,
} from '../../../core/models/user.model';
import { Shift } from '../../../core/models/course.model';
import { DOCUMENT_PATTERNS, NAME_PATTERN, PASSWORD_PATTERN } from '../../../shared/validators/user-validators';
import { generatedEmail, generatedPassword } from '../user-form/user-form.model';

/** Máximo de filas por importación (cada usuario se crea uno por uno en Firebase Auth). */
export const MAX_IMPORT_ROWS = 500;

/** Cabeceras de la plantilla, en el orden pedido. */
export const IMPORT_HEADERS = [
  'nombres', 'apellidos', 'tipodni', 'dni', 'fechanac', 'sexo', 'correo', 'rol', 'estado', 'contraseña',
  'carrera', 'ciclo', 'turno',
] as const;

/** Filas de ejemplo de la plantilla (correo y contraseña vacíos = se generan). */
export const IMPORT_TEMPLATE_ROWS: string[][] = [
  ['Ana María', 'López Ramírez', 'DNI', '76957680', '2001-05-14', 'F', '', 'Estudiante', 'Activo', '', 'Desarrollo de Sistemas de Información', '1', 'Mañana'],
  ['Luis', 'Pérez Soto', 'DNI', '45871236', '1985-11-02', 'M', '', 'Docente', 'Activo', '', '', '', ''],
];

/** Fila válida lista para crear. `line` es el número de fila en el archivo (la cabecera es la 1). */
export interface ImportRow {
  line: number;
  input: CreateUserInput;
  /** Nombre de carrera del Excel (para resolver el id en el diálogo si se pasa el catálogo). */
  careerNameRaw: string;
  semesterRaw: number | null;
  shiftRaw: Shift | null;
}

/** Fila que no se subió y por qué. */
export interface ImportIssue {
  line: number;
  name: string;
  document: string;
  reason: string;
}

export interface ParsedImport {
  /** Filas con datos (sin contar vacías). */
  total: number;
  valid: ImportRow[];
  issues: ImportIssue[];
}

type Field =
  | 'firstName' | 'lastName' | 'documentType' | 'documentNumber' | 'birthDate'
  | 'gender' | 'email' | 'role' | 'status' | 'password'
  | 'careerName' | 'semester' | 'shift';

/** Nombres de cabecera aceptados (ya normalizados: minúsculas, sin tildes ni símbolos). */
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  firstName: ['nombres', 'nombre'],
  lastName: ['apellidos', 'apellido'],
  documentType: ['tipodni', 'tipodocumento', 'tipodedocumento', 'tipo'],
  documentNumber: ['dni', 'documento', 'numerodocumento', 'nrodocumento', 'numerodedocumento'],
  birthDate: ['fechanac', 'fechanacimiento', 'fechadenacimiento'],
  gender: ['sexo', 'genero'],
  email: ['correo', 'email', 'correoelectronico'],
  role: ['rol'],
  status: ['estado'],
  password: ['contrasena', 'contrasenia', 'password', 'clave'],
  careerName: ['carrera', 'nombrecarrera', 'carreraprofeisonal'],
  semester: ['ciclo', 'semestre', 'nivel'],
  shift: ['turno'],
};

const REQUIRED_FIELDS: readonly Field[] = ['firstName', 'lastName', 'documentNumber', 'birthDate', 'gender', 'role'];

const FIELD_LABELS: Record<Field, string> = {
  firstName: 'nombres',
  lastName: 'apellidos',
  documentType: 'tipodni',
  documentNumber: 'dni',
  birthDate: 'fechanac',
  gender: 'sexo',
  email: 'correo',
  role: 'rol',
  status: 'estado',
  password: 'contraseña',
  careerName: 'carrera',
  semester: 'ciclo',
  shift: 'turno',
};

/** Texto sin tildes, en mayúsculas y solo letras/números (para comparar valores y cabeceras). */
function key(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const DOCUMENT_TYPE_VALUES: Record<string, DocumentType> = {  DNI: 'DNI',
  CE: 'CE',
  CARNETDEEXTRANJERIA: 'CE',
  CARNEEXTRANJERIA: 'CE',
  PASAPORTE: 'PASSPORT',
  PASSPORT: 'PASSPORT',
  PAS: 'PASSPORT',
};
const GENDER_VALUES: Record<string, Gender> = {
  M: 'MALE', MASCULINO: 'MALE', MALE: 'MALE', HOMBRE: 'MALE', VARON: 'MALE',
  F: 'FEMALE', FEMENINO: 'FEMALE', FEMALE: 'FEMALE', MUJER: 'FEMALE',
  O: 'OTHER', OTRO: 'OTHER', OTHER: 'OTHER',
};
const ROLE_VALUES: Record<string, UserRole> = {
  ESTUDIANTE: 'STUDENT', ALUMNO: 'STUDENT', STUDENT: 'STUDENT',
  DOCENTE: 'TEACHER', PROFESOR: 'TEACHER', TEACHER: 'TEACHER',
  ADMINISTRADOR: 'ADMIN', ADMIN: 'ADMIN',
};
const STATUS_VALUES: Record<string, UserStatus> = {
  ACTIVO: 'ACTIVE', ACTIVE: 'ACTIVE',
  PENDIENTE: 'PENDING', PENDING: 'PENDING',
  DESHABILITADO: 'DISABLED', INACTIVO: 'DISABLED', DISABLED: 'DISABLED',
};

const SHIFT_VALUES: Record<string, Shift> = {
  MANANA: 'MORNING', MORNING: 'MORNING', MAÑANA: 'MORNING', M: 'MORNING',
  NOCHE: 'EVENING', EVENING: 'EVENING', TARDE: 'EVENING', N: 'EVENING',
};

// ---------------------------------------------------------------- lectura de archivos

/** Lee un .xlsx (primera hoja) o un .csv y devuelve las filas como matriz. */
export async function readImportFile(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    return (await readSheet(file)) as unknown[][];
  }
  if (name.endsWith('.csv')) {
    return parseCsv(await decodeText(file));
  }
  throw new Error('Formato no soportado. Sube un archivo .xlsx o .csv.');
}

/** UTF-8; si el CSV viene en ANSI (Excel en español) cae a Windows-1252 para no romper las tildes. */
async function decodeText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Parser CSV mínimo: comillas, comillas escapadas y delimitador `,` o `;` (el de Excel en español). */
function parseCsv(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semicolons > commas ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- validación

const pad = (n: number) => String(n).padStart(2, '0');

/** Convierte una celda de fecha (Date, serie de Excel o texto) a YYYY-MM-DD, o null si no es válida. */
function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0;
    return utcMidnight
      ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
      : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'number' && value > 1 && value < 80000) {
    // Número de serie de Excel (días desde 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const text = String(value ?? '').trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  const real = check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  return real ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Misma regla del formulario: no futura y máximo 100 años. */
function birthDateError(iso: string): string | null {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  if (date > today) return 'fechanac: la fecha no puede ser futura';
  const oldest = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
  return date < oldest ? 'fechanac: la fecha no es válida' : null;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida todas las filas del archivo con las mismas reglas del formulario de registro.
 * Las filas con errores NO se importan y quedan en `issues` con el motivo.
 */
export function parseImport(rows: readonly (readonly unknown[])[]): ParsedImport {
  if (!rows.length) throw new Error('El archivo está vacío.');

  // Cabeceras -> índice de columna.
  const columns = new Map<Field, number>();
  rows[0].forEach((header, index) => {
    const normalized = key(header).toLowerCase();
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (!columns.has(field) && HEADER_ALIASES[field].includes(normalized)) columns.set(field, index);
    }
  });
  const missing = REQUIRED_FIELDS.filter((f) => !columns.has(f)).map((f) => FIELD_LABELS[f]);
  if (missing.length) {
    throw new Error(`Faltan columnas obligatorias en la primera fila: ${missing.join(', ')}.`);
  }

  const get = (row: readonly unknown[], field: Field): unknown => {
    const index = columns.get(field);
    return index === undefined ? undefined : row[index];
  };

  const dataRows = rows
    .map((row, index) => ({ row, line: index + 1 }))
    .slice(1)
    .filter(({ row }) => row.some((c) => cellText(c) !== ''));

  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`El archivo tiene ${dataRows.length} filas. El máximo por importación es ${MAX_IMPORT_ROWS}.`);
  }

  const valid: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seenDocuments = new Map<string, number>();
  const seenEmails = new Map<string, number>();

  for (const { row, line } of dataRows) {
    const errors: string[] = [];

    const firstName = cellText(get(row, 'firstName')).replace(/\s+/g, ' ');
    const lastName = cellText(get(row, 'lastName')).replace(/\s+/g, ' ');
    for (const [label, value] of [['nombres', firstName], ['apellidos', lastName]] as const) {
      if (!value) errors.push(`${label}: obligatorio`);
      else if (value.length > 50) errors.push(`${label}: máximo 50 caracteres`);
      else if (!NAME_PATTERN.test(value)) errors.push(`${label}: solo letras, espacios, apóstrofes y guiones`);
    }

    // Tipo de documento (vacío = DNI).
    const typeText = cellText(get(row, 'documentType'));
    const documentType = typeText ? DOCUMENT_TYPE_VALUES[key(typeText)] : 'DNI';
    if (!documentType) errors.push(`tipodni: "${typeText}" no es válido (usa ${DOCUMENT_TYPES.join(', ')})`);

    // Documento. Excel guarda el DNI como número y pierde los ceros iniciales: se completa a 8 dígitos.
    let documentNumber = cellText(get(row, 'documentNumber')).replace(/\s+/g, '').toUpperCase();
    if ((documentType ?? 'DNI') === 'DNI' && /^\d{1,7}$/.test(documentNumber)) {
      documentNumber = documentNumber.padStart(8, '0');
    }
    if (!documentNumber) {
      errors.push('dni: obligatorio');
    } else if (documentType) {
      const rule = DOCUMENT_PATTERNS[documentType];
      if (!rule.pattern.test(documentNumber)) errors.push(`dni: debe tener ${rule.hint}`);
    }

    // Fecha de nacimiento.
    const birthRaw = get(row, 'birthDate');
    let birthDate = '';
    if (cellText(birthRaw) === '') {
      errors.push('fechanac: obligatorio');
    } else {
      const iso = toIsoDate(birthRaw);
      if (!iso) errors.push('fechanac: formato no válido (usa AAAA-MM-DD o DD/MM/AAAA)');
      else {
        const dateError = birthDateError(iso);
        if (dateError) errors.push(dateError);
        else birthDate = iso;
      }
    }

    // Sexo, rol y estado.
    const genderText = cellText(get(row, 'gender'));
    const gender = genderText ? GENDER_VALUES[key(genderText)] : undefined;
    if (!genderText) errors.push('sexo: obligatorio');
    else if (!gender) errors.push(`sexo: "${genderText}" no es válido (M, F u Otro)`);

    const roleText = cellText(get(row, 'role'));
    const role = roleText ? ROLE_VALUES[key(roleText)] : undefined;
    if (!roleText) errors.push('rol: obligatorio');
    else if (!role) errors.push(`rol: "${roleText}" no es válido (Estudiante, Docente o Administrador)`);

    const statusText = cellText(get(row, 'status'));
    const status = statusText ? STATUS_VALUES[key(statusText)] : 'ACTIVE';
    if (!status) errors.push(`estado: "${statusText}" no es válido (Activo, Pendiente o Deshabilitado)`);

    // Correo y contraseña: los del archivo o, si están vacíos, los generados con el documento.
    const emailText = cellText(get(row, 'email')).toLowerCase();
    const email = emailText || (documentNumber ? generatedEmail(documentNumber) : '');
    if (emailText) {
      if (!EMAIL_PATTERN.test(emailText)) errors.push('correo: no es válido');
      else if (emailText.length > 100) errors.push('correo: máximo 100 caracteres');
    }

    const passwordText = cellText(get(row, 'password'));
    const password = passwordText || (documentNumber ? generatedPassword(documentNumber) : '');
    if (passwordText) {
      if (passwordText.length < 8) errors.push('contraseña: mínimo 8 caracteres');
      else if (!PASSWORD_PATTERN.test(passwordText)) errors.push('contraseña: debe incluir letras y números');
    }

    // Campos académicos opcionales (solo para estudiantes; se ignoran en otros roles).
    const careerNameRaw = cellText(get(row, 'careerName'));
    const semesterRaw = (() => {
      const v = cellText(get(row, 'semester'));
      const n = Number(v);
      return v && Number.isInteger(n) && n >= 1 ? n : null;
    })();
    const shiftText = cellText(get(row, 'shift'));
    const shiftRaw: Shift | null = shiftText ? (SHIFT_VALUES[key(shiftText)] ?? null) : null;

    // Duplicados dentro del propio archivo.
    if (documentNumber) {
      const first = seenDocuments.get(documentNumber);
      if (first !== undefined) errors.push(`dni: repetido en el archivo (fila ${first})`);
      else seenDocuments.set(documentNumber, line);
    }
    if (email) {
      const first = seenEmails.get(email);
      if (first !== undefined) errors.push(`correo: repetido en el archivo (fila ${first})`);
      else seenEmails.set(email, line);
    }

    if (errors.length || !documentType || !gender || !role || !status) {
      issues.push({
        line,
        name: `${firstName} ${lastName}`.trim() || '—',
        document: documentNumber || '—',
        reason: errors.join('; '),
      });
      continue;
    }

    valid.push({
      line,
      input: {
        firstName,
        lastName,
        documentType,
        documentNumber,
        birthDate,
        gender,
        email,
        password,
        phone: '',
        address: '',
        role,
        status,
        // Académicos: se cargan en el diálogo si el rol es STUDENT
        careerId: null,  // se resuelve en el diálogo contra la lista de carreras
        careerName: role === 'STUDENT' ? (careerNameRaw || null) : null,
        semester: role === 'STUDENT' ? semesterRaw : null,
        shift: role === 'STUDENT' ? shiftRaw : null,
      },
      careerNameRaw: role === 'STUDENT' ? careerNameRaw : '',
      semesterRaw: role === 'STUDENT' ? semesterRaw : null,
      shiftRaw: role === 'STUDENT' ? shiftRaw : null,
    });
  }

  return { total: dataRows.length, valid, issues };
}
