import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { AdminDashboard } from './admin-dashboard';
import { StudentDashboard } from './student-dashboard';
import { TeacherDashboard } from './teacher-dashboard';

@Component({
  selector: 'app-dashboard',
  imports: [AdminDashboard, TeacherDashboard, StudentDashboard],
  template: `
    @switch (user()?.role) {
      @case ('ADMIN') {
        <app-admin-dashboard />
      }
      @case ('TEACHER') {
        <app-teacher-dashboard />
      }
      @case ('STUDENT') {
        <app-student-dashboard />
      }
    }
  `,
})
export class Dashboard {
  protected readonly user = inject(AuthService).currentUser;
}
