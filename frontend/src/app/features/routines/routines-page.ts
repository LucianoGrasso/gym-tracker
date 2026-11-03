import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-routines-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="text-2xl font-bold">Rutinas</h1>`,
})
export class RoutinesPage {}
