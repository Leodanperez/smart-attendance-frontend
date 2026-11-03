import { Routes } from '@angular/router';

import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guards';

const t = (title: string) => `${title} | Smart Attendance`;

export const routes: Routes = [
    {
        path: 'login',
        title: t('Iniciar sesión'),
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login').then((m) => m.Login),
    },
    {
        path: 'descargar',
        title: t('Descargar la app'),
        loadComponent: () => import('./features/download/download').then((m) => m.Download),
    },
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () => import('./core/layout/dashboard-layout').then((m) => m.DashboardLayout),
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
            {
                path: 'dashboard',
                title: t('Dashboard'),
                loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
            },

            // Usuarios (W03, W04)
            {
                path: 'users',
                title: t('Usuarios'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/users/users-list').then((m) => m.UsersList),
            },
            {
                path: 'users/new',
                title: t('Registrar usuario'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/users/user-form/user-form').then((m) => m.UserForm),
            },
            {
                path: 'users/:uid',
                title: t('Detalle de usuario'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/users/user-detail').then((m) => m.UserDetail),
            },

            // Periodos académicos (2026-I, 2026-II)
            {
                path: 'academic-periods',
                title: t('Periodos académicos'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () =>
                    import('./features/academic-periods/academic-periods').then((m) => m.AcademicPeriods),
            },

            // Carreras del instituto
            {
                path: 'careers',
                title: t('Carreras'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/careers/careers').then((m) => m.Careers),
            },

            // Cursos (W05, W09)
            {
                path: 'courses',
                title: t('Cursos'),
                loadComponent: () => import('./features/courses/courses-list').then((m) => m.CoursesList),
            },
            {
                path: 'courses/new',
                title: t('Nuevo curso'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/courses/course-form').then((m) => m.CourseForm),
            },
            {
                path: 'courses/:id/edit',
                title: t('Editar curso'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/courses/course-form').then((m) => m.CourseForm),
            },
            {
                path: 'courses/:id',
                title: t('Detalle de curso'),
                loadComponent: () => import('./features/courses/course-detail').then((m) => m.CourseDetail),
            },

            // Administración académica (W06, W07)
            {
                path: 'teacher-assignments',
                title: t('Asignación de docentes'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () =>
                    import('./features/teacher-assignments/teacher-assignments').then((m) => m.TeacherAssignments),
            },
            {
                path: 'enrollments',
                title: t('Inscripciones'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/enrollments/enrollments').then((m) => m.Enrollments),
            },
            {
                path: 'students',
                title: t('Estudiantes'),
                canActivate: [roleGuard('ADMIN', 'TEACHER')],
                loadComponent: () => import('./features/students/students').then((m) => m.Students),
            },

            // Operación docente (W10, W11)
            {
                path: 'sessions',
                title: t('Sesiones'),
                canActivate: [roleGuard('ADMIN', 'TEACHER')],
                loadComponent: () => import('./features/sessions/sessions').then((m) => m.Sessions),
            },
            {
                path: 'live-attendance',
                title: t('Asistencia en vivo'),
                canActivate: [roleGuard('ADMIN', 'TEACHER')],
                loadComponent: () =>
                    import('./features/live-attendance/live-attendance').then((m) => m.LiveAttendance),
            },

            // Reportes y auditoría (W12, W13)
            {
                path: 'reports',
                title: t('Reportes'),
                canActivate: [roleGuard('ADMIN', 'TEACHER')],
                loadComponent: () => import('./features/reports/reports').then((m) => m.Reports),
            },
            {
                path: 'audit',
                title: t('Auditoría'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/audit/audit').then((m) => m.Audit),
            },

            // Configuración y perfil (W14)
            {
                path: 'settings',
                title: t('Configuración'),
                canActivate: [roleGuard('ADMIN')],
                loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
            },
            {
                path: 'profile',
                title: t('Mi perfil'),
                loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
            },
        ],
    },
    { path: '**', redirectTo: '' },
];
