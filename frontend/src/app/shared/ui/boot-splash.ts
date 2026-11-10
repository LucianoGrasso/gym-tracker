import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Pantalla de arranque: el ícono de la app (mancuerna lima en baldosa redondeada) cargándose como en
 * el gimnasio, en bucle: los discos grandes entran desde los bordes hacia el centro, rebotan contra el
 * tope, y luego los chicos.
 * Se ve mientras la app espera la sesión (Aurora puede tardar ~15 s en despertar).
 * Hay una copia estática en index.html (se ve antes de que cargue el JS): mantenerlas iguales.
 * Animación en styles.css (`.boot-*`).
 */
@Component({
  selector: 'app-boot-splash',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="boot-splash" role="status" aria-busy="true">
      <div class="boot-tile">
        <svg class="boot-logo" viewBox="0 0 512 512" aria-hidden="true">
          <rect x="192" y="236" width="128" height="40" rx="8" />
          <rect class="boot-plate-inner boot-left" x="144" y="144" width="48" height="224" rx="14" />
          <rect class="boot-plate-inner boot-right" x="320" y="144" width="48" height="224" rx="14" />
          <rect class="boot-plate-outer boot-left" x="96" y="176" width="40" height="160" rx="12" />
          <rect class="boot-plate-outer boot-right" x="376" y="176" width="40" height="160" rx="12" />
        </svg>
      </div>
      <p class="boot-name">Gym Tracker</p>
      <p class="skeleton-hint boot-hint">Despertando el servidor…</p>
    </div>
  `,
})
export class BootSplash {}
