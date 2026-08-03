// Generación local de identificadores y códigos visibles — 100% offline, sin
// depender del backend ni de internet.
//
// Reglas de estabilidad (no negociables):
//   1. El código se asigna UNA sola vez, al crear el elemento.
//   2. Nunca se recalcula por la posición visual del bloque.
//   3. Nunca cambia al ordenar ni al editar el registro.
//   4. Los correlativos eliminados NO se reutilizan: el contador solo sube.
//   5. NO existe (ni debe existir) una función que renumere elementos ya creados.
//
// Por eso este módulo expone únicamente funciones puras de formato y un
// generador de UUID: quien administra los contadores es el formulario, y solo
// los incrementa al agregar un elemento nuevo.

// UUID técnico inmutable. crypto.randomUUID existe en todo contexto seguro
// (HTTPS/localhost); el respaldo cubre webviews antiguos que no lo exponen.
export function nuevoUUID() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function pad(valor, ancho) {
  return String(valor).padStart(ancho, '0');
}

// Acepta "12", " 12 " o textos tipo "Zona 12" y devuelve el entero, o null.
export function zonaANumero(zona) {
  const m = String(zona ?? '').match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Código visible estable de la parcela: Z{zona 2 díg}-P{parcela 3 díg}.
// Ej: zona 1, parcela 1 -> "Z01-P001"; zona 12, parcela 177 -> "Z12-P177".
// Devuelve null mientras falte alguno de los dos datos.
export function codigoParcela(zona, numeroParcela) {
  const z = zonaANumero(zona);
  const p = Number(numeroParcela);
  if (!z || !Number.isInteger(p) || p < 1) return null;
  return `Z${pad(z, 2)}-P${pad(p, 3)}`;
}

// Valores de `tipo_fila`. Los asigna la app al crear el elemento; nunca se
// exponen como un campo editable en el formulario.
export const TIPO_FILA_ESPECIE = 'ESPECIE';
export const TIPO_FILA_INDICIO = 'INDICIO';

// Código visible estable del elemento, derivado del código de la parcela:
//   especie -> {codigo_parcela}-E{correlativo 2 díg}   ej. Z01-P001-E01
//   indicio -> {codigo_parcela}-I{correlativo 2 díg}   ej. Z01-P001-I01
// Los correlativos de especies e indicios se administran por separado.
export function codigoElemento(codigoParcelaBase, tipoFila, correlativo) {
  if (!codigoParcelaBase) return '';
  const letra = tipoFila === TIPO_FILA_ESPECIE ? 'E' : 'I';
  return `${codigoParcelaBase}-${letra}${pad(correlativo, 2)}`;
}

// Etiqueta legible para el encabezado del bloque y para el geo-sello de la foto.
export function etiquetaElemento(tipoFila, codigo, correlativo) {
  const nombre = tipoFila === TIPO_FILA_ESPECIE ? 'Especie' : 'Indicio';
  return codigo ? `${nombre} ${codigo}` : `${nombre} ${correlativo}`;
}
