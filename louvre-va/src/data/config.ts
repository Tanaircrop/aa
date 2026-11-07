import raw from '../../assets/data/scene.config.json';

export type Vec2 = [number, number];

export interface Pool { id: string; pts: Vec2[] }
export interface SmallPyramid { id: string; center: Vec2; side: number; rotationDeg: number; height: number }
export interface Pavilion { name: string; x: number; width: number; dome?: boolean }
export interface Wing {
  id: string; side: 'north' | 'south' | 'east'; depth: number; pavilions: Pavilion[];
  facadeY?: number; xFrom?: number; xTo?: number; facadeX?: number; yFrom?: number; yTo?: number;
}
export interface Pose { pos: Vec2; height: number; headingDeg: number; pitchDeg?: number; focal?: number }
export interface LightingPreset {
  label: string; utc: string; sky: 'clear' | 'overcast'; turbidity: number; rayleigh: number;
  sunIntensity: number; ambient: number; fog: number; rain?: boolean; exposure?: number; envIntensity?: number; mie?: number; mieG?: number; env?: { top: number[]; bottom: number[]; ground: number[] };
}
export interface ReferencePhoto { id: string; label: string; preset: string; pose: Pose; note: string }

export type SceneConfig = typeof raw;
export const config: SceneConfig = raw;

export const pools: Pool[] = raw.pools as Pool[];
export const smallPyramids: SmallPyramid[] = raw.smallPyramids as SmallPyramid[];
export const wings: Wing[] = raw.wings as Wing[];
export const lightingPresets = raw.lighting.presets as Record<string, LightingPreset>;
export const referencePhotos = raw.referencePhotos as ReferencePhoto[];

/** Local plan coordinates (x east, y north) to Three.js (X, Z). */
export function toThree(p: Vec2): [number, number] { return [p[0], -p[1]]; }
export function fromThree(x: number, z: number): Vec2 { return [x, -z]; }

/** Vertical field of view for a focal length on a 36x24 sensor. */
export function vFovDeg(focalMm: number): number {
  return (2 * Math.atan(12 / focalMm) * 180) / Math.PI;
}
