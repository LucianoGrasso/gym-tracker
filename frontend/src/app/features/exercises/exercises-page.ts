import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-exercises-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="text-2xl font-bold">Ejercicios</h1>`,
})
export class ExercisesPage {}
