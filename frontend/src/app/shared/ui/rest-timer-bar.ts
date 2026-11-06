import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBellRing, lucideTimer } from '@ng-icons/lucide';
import { RestTimerService } from '../../core/workout/rest-timer.service';

/** Banda lima de descanso, fija sobre la navegación inferior (al alcance del pulgar). */
@Component({
  selector: 'app-rest-timer-bar',
  imports: [NgIcon],
  providers: [provideIcons({ lucideBellRing, lucideTimer })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (timer.running() || timer.finished()) {
      <div
        class="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-2"
        role="timer"
        aria-live="off"
      >
        <div
          class="rest-bar-in mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-primary px-4 py-2 text-primary-foreground shadow-lg"
          [class.rest-done]="timer.finished()"
        >
          @if (timer.finished()) {
            <ng-icon name="lucideBellRing" size="22" aria-hidden="true" />
            <span class="flex-1" role="status">
              <span class="block text-lg leading-tight font-bold">¡Descanso terminado!</span>
              <span class="block text-sm opacity-80">A la siguiente serie</span>
            </span>
            <button
              type="button"
              class="h-12 rounded-xl px-4 text-sm font-bold tracking-wide uppercase hover:bg-black/10"
              (click)="timer.dismiss()"
            >
              OK
            </button>
          } @else {
          <ng-icon name="lucideTimer" size="22" aria-hidden="true" />
          <span class="text-sm font-semibold tracking-[0.06em] uppercase">Descanso</span>
          <span class="num ml-auto text-3xl leading-none font-bold" [class.rest-ending]="timer.ending()">{{ label() }}</span>
          <button
            type="button"
            class="num h-12 rounded-xl px-3 text-lg font-bold hover:bg-black/10"
            (click)="timer.add(30)"
          >
            +30 s
          </button>
          <button
            type="button"
            class="h-12 rounded-xl px-3 text-sm font-semibold tracking-wide uppercase hover:bg-black/10"
            (click)="timer.stop()"
          >
            Saltar
          </button>
          }
        </div>
      </div>
    }
  `,
})
export class RestTimerBar {
  protected readonly timer = inject(RestTimerService);
  protected readonly label = computed(() => {
    const total = this.timer.remaining();
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  });
}
