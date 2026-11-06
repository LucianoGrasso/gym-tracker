import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar · GymTracker',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'hoy' },
      { path: 'hoy', title: 'Hoy · GymTracker', loadComponent: () => import('./features/today/today-page').then((m) => m.TodayPage) },
      { path: 'cuenta', title: 'Cuenta · GymTracker', loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage) },
      {
        path: 'rutinas',
        title: 'Rutinas · GymTracker',
        children: [
          { path: '', loadComponent: () => import('./features/routines/routines-page').then((m) => m.RoutinesPage) },
          { path: 'plantillas', title: 'Plantillas · GymTracker', loadComponent: () => import('./features/routines/templates-page').then((m) => m.TemplatesPage) },
          { path: 'plantillas/:slug', title: 'Plantilla · GymTracker', loadComponent: () => import('./features/routines/template-detail-page').then((m) => m.TemplateDetailPage) },
          { path: ':id', loadComponent: () => import('./features/routines/routine-detail-page').then((m) => m.RoutineDetailPage) },
          { path: ':id/dias/:dayId', loadComponent: () => import('./features/routines/routine-day-page').then((m) => m.RoutineDayPage) },
        ],
      },
      {
        path: 'ejercicios',
        title: 'Ejercicios · GymTracker',
        children: [
          { path: '', loadComponent: () => import('./features/exercises/exercises-page').then((m) => m.ExercisesPage) },
          { path: 'nuevo', loadComponent: () => import('./features/exercises/exercise-form-page').then((m) => m.ExerciseFormPage) },
          { path: ':id', loadComponent: () => import('./features/exercises/exercise-detail-page').then((m) => m.ExerciseDetailPage) },
          { path: ':id/editar', loadComponent: () => import('./features/exercises/exercise-form-page').then((m) => m.ExerciseFormPage) },
        ],
      },
      {
        path: 'entrenamiento/:id',
        title: 'Entrenamiento · GymTracker',
        loadComponent: () => import('./features/workout/workout-page').then((m) => m.WorkoutPage),
      },
      {
        path: 'entrenamientos',
        title: 'Entrenamientos · GymTracker',
        loadComponent: () => import('./features/workout/workouts-page').then((m) => m.WorkoutsPage),
      },
      {
        path: 'estadisticas',
        title: 'Estadísticas · GymTracker',
        children: [
          { path: '', loadComponent: () => import('./features/stats/stats-page').then((m) => m.StatsPage) },
          {
            path: 'ejercicios/:id',
            loadComponent: () => import('./features/stats/exercise-stats-page').then((m) => m.ExerciseStatsPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
