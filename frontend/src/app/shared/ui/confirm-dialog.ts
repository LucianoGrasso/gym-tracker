import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Texto del botón que acepta, p. ej. "Eliminar". */
  confirmLabel: string;
  /** Acción que borra o quita algo: el botón va en rojo. */
  destructive?: boolean;
}

/** Tarjeta de confirmación de la app (reemplaza al confirm() del navegador). */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-labelledby': 'confirm-title',
    '[attr.aria-describedby]': 'data.message ? "confirm-message" : null',
    class: 'confirm-sheet block rounded-t-2xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl',
  },
  template: `
    <h2 id="confirm-title" class="text-lg font-bold">{{ data.title }}</h2>
    @if (data.message) {
      <p id="confirm-message" class="mt-2 text-sm text-muted-foreground">{{ data.message }}</p>
    }
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button type="button" class="h-12 rounded-xl border border-border font-semibold" (click)="ref.close(false)">
        Cancelar
      </button>
      <button
        type="button"
        class="h-12 rounded-xl font-bold"
        [class.bg-destructive]="data.destructive"
        [class.text-white]="data.destructive"
        [class.bg-primary]="!data.destructive"
        [class.text-primary-foreground]="!data.destructive"
        (click)="ref.close(true)"
      >
        {{ data.confirmLabel }}
      </button>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  /** true si el usuario acepta; false si cancela, toca fuera o presiona Escape. */
  async ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<boolean, ConfirmOptions>(ConfirmDialog, {
      data: options,
      width: '100%',
      maxWidth: '32rem',
      autoFocus: 'first-tabbable',
      backdropClass: 'confirm-backdrop',
      positionStrategy: this.overlay.position().global().centerHorizontally().bottom('0'),
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
