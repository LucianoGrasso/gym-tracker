import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="text-2xl font-bold">Estadísticas</h1>`,
})
export class StatsPage {}
