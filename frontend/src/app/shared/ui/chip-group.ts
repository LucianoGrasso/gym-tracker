import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface ChipOption {
  value: string;
  label: string;
}

/** Fila de chips de selección única (período, métrica): el elegido en lima, objetivos de 48 px. */
@Component({
  selector: 'app-chip-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          class="num h-12 shrink-0 rounded-full border px-4 text-lg font-semibold tracking-wide uppercase"
          [attr.aria-checked]="option.value === value()"
          [class.bg-primary]="option.value === value()"
          [class.border-primary]="option.value === value()"
          [class.text-primary-foreground]="option.value === value()"
          [class.border-border]="option.value !== value()"
          [class.text-muted-foreground]="option.value !== value()"
          (click)="value.set(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class ChipGroup {
  readonly options = input.required<readonly ChipOption[]>();
  readonly value = model.required<string>();
  readonly label = input.required<string>();
}
