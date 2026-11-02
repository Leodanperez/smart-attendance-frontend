import { Injectable } from '@angular/core';

import { ATTENDED_STATUSES, Attendance, attendanceId } from '../models/attendance.model';
import { Course } from '../models/course.model';
import { Enrollment } from '../models/enrollment.model';
import { ClassSession } from '../models/session.model';
import { tsMillis } from './firestore.utils';

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface StudentStats {
  courseId: string;
  studentId: string;
  validSessions: number;
  present: number;
  late: number;
  absent: number;
  justified: number;
  /** null cuando no hay sesiones válidas. */
  percentage: number | null;
}

export interface SessionSummary {
  session: ClassSession;
  enrolled: number;
  present: number;
  late: number;
  absent: number;
  justified: number;
  pending: number;
  percentage: number | null;
}

export interface CourseReport {
  course: Course;
  students: StudentStats[];
  sessions: SessionSummary[];
  closedSessions: number;
  attended: number;
  denominator: number;
  averagePercentage: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function inRange(millis: number, range?: DateRange): boolean {
  if (!range) return true;
  if (range.from && millis < range.from.getTime()) return false;
  if (range.to && millis > range.to.getTime()) return false;
  return true;
}

/** Cálculos de asistencia según ATTENDANCE_RULE_TEXT. */
@Injectable({ providedIn: 'root' })
export class ReportService {
  buildCourseReport(
    course: Course,
    enrollments: readonly Enrollment[],
    sessions: readonly ClassSession[],
    attendances: readonly Attendance[],
    range?: DateRange,
  ): CourseReport {
    const active = enrollments.filter((e) => e.courseId === course.id && e.status === 'ACTIVE');
    const courseSessions = sessions.filter(
      (s) => s.courseId === course.id && inRange(tsMillis(s.startsAt), range),
    );
    const byKey = new Map(
      attendances
        .filter((a) => a.courseId === course.id)
        .map((a) => [attendanceId(a.sessionId, a.studentId), a]),
    );
    const enrolledFor = (session: ClassSession) =>
      active.filter((e) => tsMillis(e.enrolledAt) <= tsMillis(session.expiresAt));

    // Por estudiante
    const closed = courseSessions.filter((s) => s.status === 'CLOSED');
    const students = active.map((enrollment): StudentStats => {
      const stats: StudentStats = {
        courseId: course.id,
        studentId: enrollment.studentId,
        validSessions: 0,
        present: 0,
        late: 0,
        absent: 0,
        justified: 0,
        percentage: null,
      };
      for (const session of closed) {
        if (tsMillis(enrollment.enrolledAt) > tsMillis(session.expiresAt)) continue;
        stats.validSessions++;
        const status = byKey.get(attendanceId(session.id, enrollment.studentId))?.status ?? 'ABSENT';
        if (status === 'PRESENT') stats.present++;
        else if (status === 'LATE') stats.late++;
        else if (status === 'JUSTIFIED') stats.justified++;
        else stats.absent++;
      }
      const denominator = stats.validSessions - stats.justified;
      stats.percentage = denominator > 0 ? round1(((stats.present + stats.late) / denominator) * 100) : null;
      return stats;
    });

    // Por sesión
    const sessionSummaries = courseSessions.map((session): SessionSummary => {
      const enrolled = enrolledFor(session);
      const summary: SessionSummary = {
        session,
        enrolled: enrolled.length,
        present: 0,
        late: 0,
        absent: 0,
        justified: 0,
        pending: 0,
        percentage: null,
      };
      for (const enrollment of enrolled) {
        const record = byKey.get(attendanceId(session.id, enrollment.studentId));
        if (!record) {
          if (session.status === 'CLOSED') summary.absent++;
          else summary.pending++;
          continue;
        }
        if (record.status === 'PRESENT') summary.present++;
        else if (record.status === 'LATE') summary.late++;
        else if (record.status === 'JUSTIFIED') summary.justified++;
        else summary.absent++;
      }
      const denominator = summary.enrolled - summary.justified - summary.pending;
      summary.percentage =
        denominator > 0 ? round1(((summary.present + summary.late) / denominator) * 100) : null;
      return summary;
    });

    const attended = students.reduce((sum, s) => sum + s.present + s.late, 0);
    const denominator = students.reduce((sum, s) => sum + s.validSessions - s.justified, 0);

    return {
      course,
      students,
      sessions: sessionSummaries,
      closedSessions: closed.length,
      attended,
      denominator,
      averagePercentage: denominator > 0 ? round1((attended / denominator) * 100) : null,
    };
  }

  buildReports(
    courses: readonly Course[],
    enrollments: readonly Enrollment[],
    sessions: readonly ClassSession[],
    attendances: readonly Attendance[],
    range?: DateRange,
  ): CourseReport[] {
    return courses.map((c) => this.buildCourseReport(c, enrollments, sessions, attendances, range));
  }

  /** Promedio global ponderado de varios reportes. */
  overall(reports: readonly CourseReport[]): number | null {
    const attended = reports.reduce((sum, r) => sum + r.attended, 0);
    const denominator = reports.reduce((sum, r) => sum + r.denominator, 0);
    return denominator > 0 ? round1((attended / denominator) * 100) : null;
  }

  isAttended(status: string): boolean {
    return (ATTENDED_STATUSES as readonly string[]).includes(status);
  }
}

export function percentLabel(value: number | null | undefined): string {
  return value == null ? '—' : `${value}%`;
}
