import { InjectionToken } from '@angular/core';

/** Variantes que usa la app (las mismas que declara styles.css y precarga index.html). */
export const APP_FONTS = [
  '400 1em Barlow',
  '500 1em Barlow',
  '600 1em Barlow',
  '500 1em "Barlow Condensed"',
  '600 1em "Barlow Condensed"',
  '700 1em "Barlow Condensed"',
];

/** Tope de espera: con red lenta, mejor un cambio de fuente que quedarse en el splash. */
const MAX_WAIT_MS = 3_000;

/** Resuelve cuando las fuentes están listas (o al tope): el splash se va sin que el texto cambie de fuente. */
export function loadAppFonts(): Promise<void> {
  const fonts = (document as Partial<Document>).fonts;
  if (!fonts) return Promise.resolve();
  const loaded = Promise.all(APP_FONTS.map((font) => fonts.load(font))).then(
    () => undefined,
    () => undefined,
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, MAX_WAIT_MS));
  return Promise.race([loaded, timeout]);
}

export const FONTS_READY = new InjectionToken<Promise<void>>('FONTS_READY', {
  providedIn: 'root',
  factory: loadAppFonts,
});
