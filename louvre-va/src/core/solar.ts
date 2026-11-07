/** Sun position (NOAA simplified algorithm). Returns azimuth (deg, from north clockwise) and elevation (deg). */
export function sunPosition(date: Date, latDeg: number, lonDeg: number): { azimuth: number; elevation: number } {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C = Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) + Math.sin(3 * M * rad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime = 4 * (180 / Math.PI) * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (minutes + eqTime + 4 * lonDeg + 1440) % 1440;
  const ha = (tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180) * rad;
  const lat = latDeg * rad;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ)));
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zenith) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zenith))))) / rad;
  if (ha > 0) az = (az + 180) % 360; else az = (540 - az) % 360;
  return { azimuth: az, elevation: 90 - zenith / rad };
}

/**
 * Convert true azimuth/elevation to a direction in the courtyard frame (Three.js: X east, Z = -north, Y up).
 * The courtyard axis is rotated `rotDeg` clockwise from true east.
 */
export function sunDirectionThree(azimuth: number, elevation: number, rotDeg: number): [number, number, number] {
  const rad = Math.PI / 180;
  const mathTrue = 90 - azimuth; // CCW from true east
  const local = (mathTrue + rotDeg) * rad;
  const el = elevation * rad;
  const x = Math.cos(el) * Math.cos(local);
  const yNorth = Math.cos(el) * Math.sin(local);
  return [x, Math.sin(el), -yNorth];
}
