import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideBellRing, lucideTimer } from '@ng-icons/lucide';
import { PushService } from '../../core/push/push.service';
import { RestTimerService } from '../../core/workout/rest-timer.service';

/** Banda lima de descanso, fija sobre la navegación inferior (al alcance del pulgar). */
@Component({
  selector: 'app-rest-timer-bar',
  imports: [NgIcon],
  providers: [provideIcons({ lucideBell, lucideBellRing, lucideTimer })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (timer.running() || timer.finished()) {
      <div class="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-2">
        @if (askPush()) {
          <div
            class="rest-bar-in mx-auto mb-2 max-w-lg rounded-2xl border border-border bg-card p-3 shadow-lg"
            role="group"
            aria-label="Avisos de descanso"
          >
            <p class="flex items-start gap-2 text-sm">
              <ng-icon name="lucideBell" size="18" class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              ¿Te aviso cuando termine el descanso, aunque tengas el teléfono bloqueado?
            </p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                class="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground"
                (click)="enablePush()"
              >
                Activar
              </button>
              <button
                type="button"
                class="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
                (click)="push.decline()"
              >
                Ahora no
              </button>
            </div>
          </div>
        }
        <div
          class="rest-bar-in mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-primary px-4 py-2 text-primary-foreground shadow-lg"
          [class.rest-done]="timer.finished()"
          role="timer"
          aria-live="off"
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
            <span class="num ml-auto text-3xl leading-none font-bold" [class.rest-ending]="timer.ending()">{{
              label()
            }}</span>
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
  protected readonly push = inject(PushService);
  protected readonly label = computed(() => {
    const total = this.timer.remaining();
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  });
  /** Primera vez: se pregunta durante un descanso, cuando el aviso tiene sentido. */
  protected readonly askPush = computed(() => this.timer.running() && this.push.status() === 'unasked');

  protected async enablePush(): Promise<void> {
    if (await this.push.enable()) this.timer.scheduleCurrent();
  }
}
