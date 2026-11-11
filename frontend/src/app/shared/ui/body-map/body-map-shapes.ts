import type { MuscleGroup } from '../../../core/models/exercise';

/**
 * Silueta del cuerpo con los músculos en su forma anatómica simplificada (dirección "Pista").
 * Cada figura mide 100 × 210; las formas pares se dibujan del lado izquierdo y se reflejan.
 */

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;

const roundedRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} ` +
  `H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;

export interface BodyShape {
  /** Trazos del lado izquierdo (o centrales). */
  paths: string[];
  /** Si se repite reflejado en el lado derecho. */
  mirror: boolean;
}

export interface MuscleShape extends BodyShape {
  muscle: MuscleGroup;
}

export interface BodyView {
  id: 'front' | 'back';
  label: string;
  /** Desplazamiento horizontal dentro del lienzo de 220 × 210. */
  x: number;
  neutral: BodyShape[];
  muscles: MuscleShape[];
}

/** Mitad izquierda del contorno del cuerpo (cuello a pie); se refleja para cerrar la silueta. */
const SILHOUETTE =
  'M50 30 L44 30 Q36 32 30 34 Q22 36 20 44 Q17 54 17 64 Q15 76 14 86 Q12 96 13 104 Q14 110 17 108 ' +
  'Q19 104 19 98 Q21 86 23 76 Q25 68 27 62 L30 56 Q31 70 33 84 Q32 94 34 100 Q31 120 33 140 Q34 152 36 160 ' +
  'Q34 172 36 186 Q37 196 36 200 Q34 204 38 206 L46 206 Q46 200 45 196 Q46 180 46 170 Q46 162 47 158 ' +
  'Q48 140 49 118 L50 112 Z';

const body: BodyShape[] = [
  { paths: [ellipse(50, 15, 9, 11), roundedRect(45, 23, 10, 9, 2)], mirror: false },
  { paths: [SILHOUETTE], mirror: true },
];

/** Abdominales por bloques más el oblicuo, del lado izquierdo. */
const ABS = [
  roundedRect(44, 59, 5, 7, 1.5),
  roundedRect(44, 67.5, 5, 7, 1.5),
  roundedRect(44, 76, 5, 7, 1.5),
  roundedRect(44.5, 84.5, 4.5, 9, 2),
  'M42 60 Q36 64 35 76 Q36 88 41 95 L43 92 L43 60 Z',
];

export const BODY_VIEWS: BodyView[] = [
  {
    id: 'front',
    label: 'Frente',
    x: 0,
    neutral: body,
    muscles: [
      {
        muscle: 'shoulders',
        paths: ['M30 35 Q21 37 20 46 Q20 53 23 57 Q26 50 31 46 Q33 41 33 37 Z'],
        mirror: true,
      },
      { muscle: 'chest', paths: ['M49 37 Q41 35 33 38 Q30 42 31 48 Q33 56 41 57 Q47 57 49 54 Z'], mirror: true },
      { muscle: 'biceps', paths: ['M22 58 Q19 64 20 72 Q22 76 25 74 Q28 66 28 60 Q26 56 22 58 Z'], mirror: true },
      { muscle: 'core', paths: ABS, mirror: true },
      {
        muscle: 'quads',
        paths: [
          'M37 104 Q32 118 34 136 Q35 148 39 155 Q40 140 40 126 Q40 112 42 104 Z',
          'M43 104 Q41 118 42 134 Q43 148 46 156 Q49 154 49 146 Q49 128 48 112 Q47 106 43 104 Z',
        ],
        mirror: true,
      },
      {
        muscle: 'calves',
        paths: [
          'M37 164 Q34 172 35 182 Q37 188 39 186 Q40 176 39 166 Z',
          'M45 164 Q47 172 46 182 Q44 186 43 184 Q42 174 43 166 Z',
        ],
        mirror: true,
      },
    ],
  },
  {
    id: 'back',
    label: 'Espalda',
    x: 120,
    neutral: body,
    muscles: [
      { muscle: 'upper_back', paths: ['M50 26 Q46 30 38 33 Q32 35 31 37 Q38 40 42 46 Q46 56 50 66 Z'], mirror: true },
      { muscle: 'shoulders', paths: ['M31 36 Q22 37 20 46 Q20 53 23 57 Q27 49 33 43 Z'], mirror: true },
      { muscle: 'lats', paths: ['M33 46 Q31 60 34 74 Q38 86 46 92 L49 88 Q46 76 44 66 Q40 54 33 46 Z'], mirror: true },
      { muscle: 'triceps', paths: ['M21 58 Q18 66 20 74 Q23 77 26 73 Q28 64 27 58 Q24 55 21 58 Z'], mirror: true },
      { muscle: 'glutes', paths: ['M49 96 Q40 94 35 100 Q32 110 36 118 Q42 122 49 118 Z'], mirror: true },
      {
        muscle: 'hamstrings',
        paths: [
          'M36 122 Q33 134 35 146 Q37 154 40 156 Q41 140 41 124 Z',
          'M42 123 Q42 140 43 150 Q45 157 48 154 Q49 140 49 122 Z',
        ],
        mirror: true,
      },
      {
        muscle: 'calves',
        paths: [
          'M37 162 Q33 170 34 180 Q36 188 40 186 Q41 174 41 164 Z',
          'M42 163 Q41 175 42 184 Q45 190 47 184 Q48 172 46 163 Z',
        ],
        mirror: true,
      },
    ],
  },
];

/** Refleja una forma del lado izquierdo sobre el eje central de la figura. */
export const MIRROR = 'matrix(-1 0 0 1 100 0)';
