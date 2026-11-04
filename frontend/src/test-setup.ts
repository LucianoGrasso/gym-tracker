// Setup global de Vitest: IndexedDB falso antes de que cualquier spec cargue Dexie.
// Debe ir aquí (no en cada spec): con code splitting, esbuild no garantiza el orden
// de evaluación entre chunks y Dexie captura `indexedDB` al cargarse.
import 'fake-indexeddb/auto';
