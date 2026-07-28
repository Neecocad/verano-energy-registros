// Conversión de latitud/longitud (WGS84) a coordenadas UTM.
// Verano Energy opera en huso 19S; la función detecta el huso automáticamente
// a partir de la coordenada capturada.

export function latLonToUTM(lat, lon) {
  const a = 6378137.0;          // semieje mayor WGS84
  const f = 1 / 298.257223563;  // achatamiento
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);

  const zone = Math.floor((lon + 180) / 6) + 1;
  const lonOrigin = (zone - 1) * 6 - 180 + 3; // meridiano central del huso

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lonOriginRad = (lonOrigin * Math.PI) / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ep2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));

  let easting =
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 +
      ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000.0;

  let northing =
    k0 * (M + N * Math.tan(latRad) *
      ((A ** 2) / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
        ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

  const hemisferio = lat < 0 ? 'S' : 'N';
  if (lat < 0) northing += 10000000.0; // falso norte hemisferio sur

  return {
    zona: zone,
    hemisferio,
    huso: `${zone}${hemisferio}`,
    x: Math.round(easting),
    y: Math.round(northing),
  };
}
