/**
 * Cloud Functions de SmartAttendance (flujos 9 y 10 de 02-arquitectura-app-y-firebase.md).
 *
 * - generateSessionToken: el docente (panel web o Android) pide el token que va dentro del QR.
 * - registerAttendance:   el estudiante (Android) envía el token escaneado y se registra su asistencia.
 * - onSessionClosed:      al cerrar una sesión se revocan sus tokens.
 *
 * El token es aleatorio (32 bytes), temporal y solo se guarda su hash SHA-256.
 * El QR no contiene datos personales. Toda la validación ocurre aquí, con la hora del servidor.
 */
import { createHash, randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** Orígenes web permitidos (las apps Android no usan CORS). */
const WEB_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://smart-attendance-mobile.web.app',
  'https://smart-attendance-mobile.firebaseapp.com',
];

const DEFAULT_TOKEN_SECONDS = 60;
/** Margen para el estudiante que escanea justo cuando el QR rota. */
const SCAN_GRACE_MS = 15_000;

// ---------------------------------------------------------------- helpers

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

interface ActiveUser {
  uid: string;
  role: Role;
  firstName: string;
  lastName: string;
  institutionalCode: string | null;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Error con un `reason` legible por Android y el panel (details.reason). */
function fail(code: 'unauthenticated' | 'permission-denied' | 'not-found' | 'failed-precondition' | 'already-exists' | 'invalid-argument', reason: string, message: string): never {
  throw new HttpsError(code, message, { reason });
}

async function requireActiveUser(request: CallableRequest<unknown>): Promise<ActiveUser> {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'UNAUTHENTICATED', 'Debes iniciar sesión.');

  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!data) fail('permission-denied', 'USER_NOT_FOUND', 'Tu perfil no existe.');
  // Documentos antiguos sin status se consideran activos (igual que el panel).
  const status = (data['status'] as string | undefined) ?? 'ACTIVE';
  if (status !== 'ACTIVE') fail('permission-denied', 'USER_NOT_ACTIVE', 'Tu cuenta no está activa.');

  const role = data['role'] as Role;
  if (!['STUDENT', 'TEACHER', 'ADMIN'].includes(role)) fail('permission-denied', 'NO_ROLE', 'Tu cuenta no tiene un rol válido.');

  return {
    uid,
    role,
    firstName: (data['firstName'] as string | undefined) ?? (data['name'] as string | undefined) ?? '',
    lastName: (data['lastName'] as string | undefined) ?? '',
    institutionalCode: (data['institutionalCode'] as string | null | undefined) ?? null,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    fail('invalid-argument', 'INVALID_ARGUMENT', `Falta "${field}".`);
  }
  return value.trim();
}

async function tokenSeconds(): Promise<number> {
  const settings = (await db.doc('settings/general').get()).data();
  const seconds = Number(settings?.['qrRefreshSeconds']);
  return Number.isFinite(seconds) && seconds >= 15 && seconds <= 600 ? seconds : DEFAULT_TOKEN_SECONDS;
}

// ---------------------------------------------------------------- generateSessionToken

/**
 * Entrada: { sessionId }. Salida: { token, expiresAt } (epoch ms).
 * Solo el docente asignado al curso o un ADMIN, con la sesión ACTIVE y en horario.
 */
export const generateSessionToken = onCall({ cors: WEB_ORIGINS }, async (request) => {
  const user = await requireActiveUser(request);
  if (user.role === 'STUDENT') fail('permission-denied', 'NOT_ALLOWED', 'Solo docentes o administradores.');

  const sessionId = requireString((request.data as { sessionId?: unknown } | null)?.sessionId, 'sessionId');
  const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
  const session = sessionSnap.data();
  if (!session) fail('not-found', 'SESSION_NOT_FOUND', 'La sesión no existe.');

  const courseId = session['courseId'] as string;
  if (user.role === 'TEACHER') {
    const course = (await db.doc(`courses/${courseId}`).get()).data();
    const teacherIds = (course?.['teacherIds'] as string[] | undefined) ?? [];
    if (!teacherIds.includes(user.uid)) fail('permission-denied', 'NOT_COURSE_TEACHER', 'No estás asignado a este curso.');
  }

  if (session['status'] !== 'ACTIVE') fail('failed-precondition', 'SESSION_CLOSED', 'La sesión está cerrada.');
  const now = Date.now();
  if ((session['expiresAt'] as Timestamp).toMillis() < now) {
    fail('failed-precondition', 'SESSION_EXPIRED', 'La sesión ya terminó. Ciérrala o crea una nueva.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + (await tokenSeconds()) * 1000;

  await db.collection('sessionTokens').add({
    sessionId,
    courseId,
    tokenHash: sha256(token),
    status: 'ACTIVE',
    expiresAt: Timestamp.fromMillis(expiresAt),
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { token, expiresAt };
});

// ---------------------------------------------------------------- registerAttendance

/**
 * Entrada: { token } (texto leído del QR). Salida: { status, sessionTitle, courseName, registeredAt }.
 * Valida: estudiante activo, token vigente, sesión activa y en horario, inscripción activa, sin duplicado.
 */
export const registerAttendance = onCall({ cors: WEB_ORIGINS }, async (request) => {
  const user = await requireActiveUser(request);
  if (user.role !== 'STUDENT') fail('permission-denied', 'NOT_STUDENT', 'Solo los estudiantes registran asistencia.');

  const token = requireString((request.data as { token?: unknown } | null)?.token, 'token');
  const tokens = await db.collection('sessionTokens').where('tokenHash', '==', sha256(token)).limit(1).get();
  const tokenDoc = tokens.docs[0];
  if (!tokenDoc) fail('not-found', 'INVALID_TOKEN', 'El código QR no es válido.');

  const tokenData = tokenDoc.data();
  const now = Date.now();
  if (tokenData['status'] !== 'ACTIVE') fail('failed-precondition', 'TOKEN_REVOKED', 'Este código QR ya no es válido.');
  if ((tokenData['expiresAt'] as Timestamp).toMillis() + SCAN_GRACE_MS < now) {
    fail('failed-precondition', 'TOKEN_EXPIRED', 'El código QR venció. Escanea el QR actual.');
  }

  const sessionId = tokenData['sessionId'] as string;
  const courseId = tokenData['courseId'] as string;
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const attendanceRef = db.doc(`attendances/${sessionId}_${user.uid}`);
  const enrollmentRef = db.doc(`enrollments/${courseId}_${user.uid}`);

  const result = await db.runTransaction(async (tx) => {
    const [sessionSnap, enrollmentSnap, attendanceSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(enrollmentRef),
      tx.get(attendanceRef),
    ]);

    const session = sessionSnap.data();
    if (!session) fail('not-found', 'SESSION_NOT_FOUND', 'La sesión no existe.');
    if (session['status'] !== 'ACTIVE') fail('failed-precondition', 'SESSION_CLOSED', 'La sesión está cerrada.');
    if ((session['startsAt'] as Timestamp).toMillis() > now) {
      fail('failed-precondition', 'SESSION_NOT_STARTED', 'La sesión aún no empieza.');
    }
    if ((session['expiresAt'] as Timestamp).toMillis() < now) {
      fail('failed-precondition', 'SESSION_EXPIRED', 'La sesión ya terminó.');
    }
    if (enrollmentSnap.data()?.['status'] !== 'ACTIVE') {
      fail('permission-denied', 'NOT_ENROLLED', 'No estás inscrito en este curso.');
    }
    if (attendanceSnap.exists) {
      fail('already-exists', 'ALREADY_REGISTERED', 'Ya registraste tu asistencia en esta sesión.');
    }

    const lateAfter = session['lateAfter'] as Timestamp | null;
    const status = lateAfter && now > lateAfter.toMillis() ? 'LATE' : 'PRESENT';

    tx.create(attendanceRef, {
      sessionId,
      courseId,
      studentId: user.uid,
      studentName: `${user.firstName} ${user.lastName}`.trim(),
      studentCode: user.institutionalCode,
      status,
      source: 'QR',
      registeredAt: FieldValue.serverTimestamp(),
      tokenId: tokenDoc.id,
      updatedBy: null,
      updateReason: null,
      updatedAt: null,
    });
    tx.update(sessionRef, {
      [status === 'LATE' ? 'stats.late' : 'stats.present']: FieldValue.increment(1),
    });

    return {
      status,
      sessionTitle: (session['title'] as string | undefined) ?? '',
      courseName: (session['courseName'] as string | undefined) ?? '',
    };
  });

  logger.info('Asistencia registrada', { sessionId, studentId: user.uid, status: result.status });
  return { ...result, registeredAt: now };
});

// ---------------------------------------------------------------- onSessionClosed

/** Al cerrar la sesión se revocan sus tokens: el QR deja de funcionar al instante. */
export const onSessionClosed = onDocumentUpdated('sessions/{sessionId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (before?.['status'] !== 'ACTIVE' || after?.['status'] !== 'CLOSED') return;

  const tokens = await db.collection('sessionTokens').where('sessionId', '==', event.params.sessionId).get();
  const active = tokens.docs.filter((d) => d.data()['status'] === 'ACTIVE');
  if (!active.length) return;

  const batch = db.batch();
  active.forEach((d) => batch.update(d.ref, { status: 'REVOKED' }));
  await batch.commit();
  logger.info('Tokens revocados', { sessionId: event.params.sessionId, count: active.length });
});
