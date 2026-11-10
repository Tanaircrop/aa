export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  planarReflection: boolean;
  transmission: boolean;
  postprocessing: boolean;
  crowd: number;
  facadeDetail: number; // 0..1
}

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

export function detectQuality(): QualityLevel {
  const stored = localStorage.getItem('lva.quality') as QualityLevel | null;
  if (stored === 'low' || stored === 'medium' || stored === 'high') return stored;
  const mobile = isTouchDevice() && Math.min(screen.width, screen.height) < 900;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  if (mobile) return cores <= 4 || mem <= 2 ? 'low' : 'medium';
  return cores <= 4 ? 'medium' : 'high';
}

export function qualitySettings(level: QualityLevel): QualitySettings {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  switch (level) {
    case 'low':
      return { level, pixelRatio: Math.min(dpr, 1.0), shadows: false, shadowMapSize: 1024, planarReflection: false, transmission: false, postprocessing: false, crowd: 30, facadeDetail: 0.5 };
    case 'medium':
      return { level, pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowMapSize: 2048, planarReflection: false, transmission: false, postprocessing: false, crowd: 60, facadeDetail: 0.8 };
    default:
      return { level, pixelRatio: Math.min(dpr, 2), shadows: true, shadowMapSize: 4096, planarReflection: true, transmission: true, postprocessing: true, crowd: 100, facadeDetail: 1 };
  }
}
