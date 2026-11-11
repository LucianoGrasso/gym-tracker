import type { MuscleGroup } from '../../../core/models/exercise';

/**
 * Siluetas estilizadas (dirección "Pista"): formas redondeadas, sin anatomía realista.
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

const head: BodyShape = { paths: [ellipse(50, 15, 10, 12), roundedRect(45, 25, 10, 8, 2)], mirror: false };
const limbs: BodyShape = {
  paths: [ellipse(18, 85, 4, 11), ellipse(16, 101, 3.5, 4.5), ellipse(42, 159, 4, 4), ellipse(40, 198, 6, 3)],
  mirror: true,
};

export const BODY_VIEWS: BodyView[] = [
  {
    id: 'front',
    label: 'Frente',
    x: 0,
    neutral: [head, limbs, { paths: ['M38 96 H62 L58 104 H42 Z'], mirror: false }],
    muscles: [
      { muscle: 'shoulders', paths: [ellipse(26, 43, 7, 8)], mirror: true },
      { muscle: 'chest', paths: ['M49 36 H38 Q31 37 31 44 V49 Q32 56 40 56 Q46 56 49 53 Z'], mirror: true },
      { muscle: 'biceps', paths: [ellipse(22, 62, 5, 10)], mirror: true },
      { muscle: 'core', paths: [roundedRect(41, 59, 18, 34, 5)], mirror: false },
      { muscle: 'quads', paths: ['M48 106 H36 Q32 112 33 128 Q34 146 38 152 H46 Q49 140 49 126 Z'], mirror: true },
      { muscle: 'calves', paths: [ellipse(41, 178, 4.5, 13)], mirror: true },
    ],
  },
  {
    id: 'back',
    label: 'Espalda',
    x: 120,
    neutral: [head, limbs, { paths: [roundedRect(46, 63, 8, 30, 3)], mirror: false }],
    muscles: [
      {
        muscle: 'upper_back',
        paths: ['M50 27 L40 34 L31 38 Q38 42 42 50 L46 62 H54 L58 50 Q62 42 69 38 L60 34 Z'],
        mirror: false,
      },
      { muscle: 'shoulders', paths: [ellipse(26, 43, 7, 8)], mirror: true },
      { muscle: 'lats', paths: ['M44 60 Q37 52 32 48 Q30 62 33 74 Q37 86 46 92 Z'], mirror: true },
      { muscle: 'triceps', paths: [ellipse(22, 62, 5, 10)], mirror: true },
      { muscle: 'glutes', paths: [ellipse(43, 107, 7.5, 9)], mirror: true },
      { muscle: 'hamstrings', paths: ['M48 118 H37 Q33 124 34 134 Q35 148 39 153 H46 Q49 142 49 130 Z'], mirror: true },
      { muscle: 'calves', paths: [ellipse(41, 175, 5.5, 13)], mirror: true },
    ],
  },
];

/** Refleja una forma del lado izquierdo sobre el eje central de la figura. */
export const MIRROR = 'matrix(-1 0 0 1 100 0)';
