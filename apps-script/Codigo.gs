/**
 * Verano Energy — Registros de terreno · Web App de sincronización.
 *
 * Backend de la PWA "verano-energy-registros" (un registro por transecto 6.1,
 * parcela 6.2 y calicata 6.3, cada uno con GPS, foto geo-sellada y su detalle).
 *
 * Este archivo es el script de ESTA app y de ESTA planilla. No es el de
 * `Control_VeranoEnergy` (avance agregado): aquel escribe en Datos_Avance /
 * Resumen_Proyecto sobre otra planilla y no tiene nada que ver con lo de acá.
 * Antes ambos compartían un solo archivo y había que replicar los cambios a
 * mano; ahora cada repo lleva el suyo.
 *
 * --- Instalación ---
 * 1. Pega abajo, en SPREADSHEET_ID, el ID de la planilla de destino: es lo que
 *    va entre  /d/  y  /edit  en su URL.
 * 2. En esa planilla: Extensiones → Apps Script. Borra todo y pega este archivo.
 *    Guarda (Cmd/Ctrl+S).
 * 3. Implementar → Nueva implementación → Aplicación web:
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier persona
 *    Copia la URL .../exec y pégala en la PWA (Exportar → URL de sincronización),
 *    o déjala fija en js/sync.js (DEFAULT_URL).
 * 4. Si más adelante actualizas este archivo, NO crees una implementación nueva:
 *    Implementar → Administrar implementaciones → editar (lápiz) → Versión:
 *    Nueva versión → Implementar. Así la URL .../exec no cambia y no hay que
 *    tocar la app.
 *
 * Las hojas (Registros_6.x, Indicios_6.1, Elementos_6.2, Individuos_6.3) se
 * crean solas en el primer sync.
 */

// ⚠️ ÚNICO valor que hay que cambiar para apuntar a otra planilla.
const SPREADSHEET_ID = 'PEGA_AQUI_EL_ID_DE_LA_PLANILLA';

const PROYECTO_ID = 'VERANO_ENERGY';
const NOMBRE_PROYECTO = 'Verano Energy';
const HUSO_UTM = '19S';
const CARPETA_FOTOS = 'Verano Energy - Fotos';

// ---------- Hojas y esquemas ----------
const SHEET_REG_61 = 'Registros_6.1';
const SHEET_IND_61 = 'Indicios_6.1';
const SHEET_REG_62 = 'Registros_6.2';
// El detalle de 6.2 son "elementos encontrados" (especies + indicios), cada uno
// con su propia fila y su código estable. Es una hoja distinta de Indicios_6.2,
// que tenía otro esquema de columnas.
const SHEET_ELEM_62 = 'Elementos_6.2';
const SHEET_REG_63 = 'Registros_6.3';
const SHEET_INDIV_63 = 'Individuos_6.3';

const COLUMNAS_REG_61 = [
  'timestamp_sync', 'record_id', 'proyecto_id', 'nombre_proyecto', 'zona', 'fecha', 'evaluadora',
  'numero_unidad', 'utm_este', 'utm_norte', 'huso', 'codigo_gps_zona',
  'presencia_vegetacion_acompanante', 'presencia_curureras', 'foto_url', 'observaciones',
  'fecha_creacion', 'fecha_ultima_modificacion', 'estado_sincronizacion', 'fecha_sincronizacion',
];
const COLUMNAS_IND_61 = [
  'record_id', 'numero_indicio', 'utm_este', 'utm_norte', 'huso', 'codigo_gps_indicio',
  'foto_url', 'observaciones',
];

// `especies` guarda el texto libre de los registros anteriores a los "elementos
// encontrados"; en los nuevos va vacía, porque cada especie es una fila de
// Elementos_6.2. `parcela_id` es el UUID técnico y `codigo_parcela` el código
// visible estable (Z01-P001): no son lo mismo y se guardan los dos.
const COLUMNAS_REG_62 = [
  'timestamp_sync', 'record_id', 'proyecto_id', 'nombre_proyecto', 'zona', 'fecha', 'evaluadora',
  'numero_unidad', 'utm_este', 'utm_norte', 'huso', 'codigo_gps_parcela', 'tipo_vegetacion',
  'tipo_vegetacion_otro', 'especies', 'presencia_curureras', 'foto_url', 'observaciones',
  'fecha_creacion', 'fecha_ultima_modificacion', 'estado_sincronizacion', 'fecha_sincronizacion',
  'parcela_id', 'codigo_parcela', 'ultimo_numero_especie', 'ultimo_numero_indicio',
];

// Una fila por elemento. Las columnas propias de un tipo quedan vacías en las
// filas del otro: nunca se combina una especie con un indicio ni se cruzan entre
// sí (3 especies + 2 indicios = exactamente 5 filas).
const COLUMNAS_ELEM_62 = [
  'record_id', 'codigo_parcela', 'tipo_fila', 'elemento_id', 'numero_elemento', 'codigo_elemento',
  'nombre_especie', 'cobertura_porcentaje', 'observaciones_especie',
  'tipo_indicio', 'tipo_indicio_otro', 'utm_este', 'utm_norte', 'huso', 'codigo_gps_indicio',
  'observaciones_indicio', 'foto_url',
];

const COLUMNAS_REG_63 = [
  'timestamp_sync', 'record_id', 'proyecto_id', 'nombre_proyecto', 'zona', 'fecha', 'evaluadora',
  'numero_unidad', 'utm_este', 'utm_norte', 'huso', 'codigo_gps_calicata', 'presencia_geofita',
  'foto_url', 'observaciones', 'fecha_creacion', 'fecha_ultima_modificacion',
  'estado_sincronizacion', 'fecha_sincronizacion',
];
const COLUMNAS_INDIV_63 = [
  'record_id', 'numero_individuo', 'profundidad_cm', 'estado_fenologico', 'estado_sanitario', 'foto_url',
];

const CONFIG_INDIVIDUAL = {
  '6.1': { hojaReg: SHEET_REG_61, colReg: COLUMNAS_REG_61, hojaDet: SHEET_IND_61, colDet: COLUMNAS_IND_61, prefijoFoto: 'indicio' },
  '6.2': { hojaReg: SHEET_REG_62, colReg: COLUMNAS_REG_62, hojaDet: SHEET_ELEM_62, colDet: COLUMNAS_ELEM_62, prefijoFoto: 'elemento' },
  '6.3': { hojaReg: SHEET_REG_63, colReg: COLUMNAS_REG_63, hojaDet: SHEET_INDIV_63, colDet: COLUMNAS_INDIV_63, prefijoFoto: 'individuo' },
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (SPREADSHEET_ID === 'PEGA_AQUI_EL_ID_DE_LA_PLANILLA') {
      return _json({ status: 'error', mensaje: 'Falta configurar SPREADSHEET_ID en el script.' });
    }

    let payload;
    if (e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    } else {
      payload = JSON.parse(e.postData.contents);
    }

    // Este deployment solo atiende registros individuales. El avance agregado
    // vive en otro script y otra planilla (repo Control_VeranoEnergy).
    if (payload.tipo !== 'registro_individual') {
      return _json({ status: 'error', mensaje: 'Este Web App solo recibe tipo: registro_individual. Recibido: ' + payload.tipo });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return _json(_registrarIndividual(ss, payload));
  } catch (err) {
    return _json({ status: 'error', mensaje: err.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return _json({
    status: 'ok',
    mensaje: 'Verano Energy – Registros de terreno – API activa',
    planilla_configurada: SPREADSHEET_ID !== 'PEGA_AQUI_EL_ID_DE_LA_PLANILLA',
  });
}

// Upsert idempotente por record_id de un transecto/parcela/calicata y su detalle,
// subiendo la foto principal y la de cada ítem del detalle a Drive.
function _registrarIndividual(ss, payload) {
  const cfg = CONFIG_INDIVIDUAL[payload.codigo_edt];
  if (!cfg) return { status: 'error', mensaje: 'codigo_edt inválido: ' + payload.codigo_edt };

  const recordId = payload.record_id;
  const registro = payload.registro || {};
  const detalle = payload.detalle || [];

  const hojaReg = _hoja(ss, cfg.hojaReg);
  const hojaDet = _hoja(ss, cfg.hojaDet);
  // El encabezado REAL de la hoja manda: si la hoja ya existía con menos
  // columnas, las nuevas se agregan al final y cada valor se escribe según el
  // nombre de su columna. Así una planilla en uso incorpora campos nuevos sin
  // descuadrar las filas históricas.
  const colReg = _asegurarEncabezado(hojaReg, cfg.colReg);
  const colDet = _asegurarEncabezado(hojaDet, cfg.colDet);

  // Si este record_id ya estaba, se borran sus filas antes de reinsertarlas:
  // reintentar un sync interrumpido no duplica nada.
  _eliminarPorRecordId(hojaReg, colReg, recordId);
  _eliminarPorRecordId(hojaDet, colDet, recordId);

  const ts = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
  let carpeta = null;

  if (registro.foto) {
    carpeta = carpeta || _obtenerCarpeta(payload.codigo_edt);
    registro.foto_url = _guardarFoto(carpeta, registro.foto, recordId);
  }
  hojaReg.appendRow(colReg.map(function (col) {
    if (col === 'timestamp_sync') return ts;
    if (col === 'record_id') return recordId;
    if (col === 'proyecto_id') return registro.proyecto_id || PROYECTO_ID;
    if (col === 'nombre_proyecto') return registro.nombre_proyecto || NOMBRE_PROYECTO;
    if (col === 'estado_sincronizacion') return 'Sincronizado';
    if (col === 'fecha_sincronizacion') return ts;
    // Fecha real (no texto) para que ordenar y filtrar por fecha funcione.
    if (col === 'fecha' && registro.fecha) return new Date(registro.fecha + 'T00:00:00');
    return registro[col] !== undefined && registro[col] !== null ? registro[col] : '';
  }));

  detalle.forEach(function (item, i) {
    if (item.foto) {
      carpeta = carpeta || _obtenerCarpeta(payload.codigo_edt);
      item.foto_url = _guardarFoto(carpeta, item.foto, recordId + '_' + _sufijoFoto(cfg, item, i));
    }
    hojaDet.appendRow(colDet.map(function (col) {
      if (col === 'record_id') return recordId;
      return item[col] !== undefined && item[col] !== null ? item[col] : '';
    }));
  });

  return { status: 'ok', codigo_edt: payload.codigo_edt, record_id: recordId, detalle: detalle.length };
}

// Nombre del archivo de la foto de un ítem del detalle. Se usa el código o el
// número estable que trae el ítem, no su posición en el arreglo: si se elimina un
// elemento, las fotos de los demás siguen apuntando al mismo archivo en Drive.
// El índice queda solo como respaldo para registros antiguos sin código.
function _sufijoFoto(cfg, item, i) {
  if (item.codigo_elemento) return item.codigo_elemento;
  if (item.numero_individuo) return cfg.prefijoFoto + item.numero_individuo;
  if (item.numero_indicio) return cfg.prefijoFoto + item.numero_indicio;
  return cfg.prefijoFoto + (i + 1);
}

// Devuelve el encabezado real de la hoja. Si está vacía lo crea con `columnas`;
// si ya existe, agrega al final las columnas que falten (sin tocar ni reordenar
// las que ya tienen datos) y devuelve el encabezado resultante.
function _asegurarEncabezado(sheet, columnas) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columnas.length).setValues([columnas]);
    sheet.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return columnas.slice();
  }
  const ancho = Math.max(sheet.getLastColumn(), 1);
  const actual = sheet.getRange(1, 1, 1, ancho).getValues()[0]
    .map(function (v) { return String(v).trim(); })
    .filter(function (v) { return v !== ''; });
  const faltantes = columnas.filter(function (c) { return actual.indexOf(c) === -1; });
  if (faltantes.length) {
    const desde = actual.length + 1;
    sheet.getRange(1, desde, 1, faltantes.length).setValues([faltantes]);
    sheet.getRange(1, desde, 1, faltantes.length).setFontWeight('bold');
  }
  return actual.concat(faltantes);
}

function _eliminarPorRecordId(sheet, columnas, recordId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const col = columnas.indexOf('record_id') + 1;
  if (col <= 0) return;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === recordId) sheet.deleteRow(i + 2);
  }
}

function _hoja(ss, nombre) {
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) sheet = ss.insertSheet(nombre);
  return sheet;
}

// Carpeta base "Verano Energy - Fotos" en Drive, con una subcarpeta por EDT
// ("EDT 6.1", "EDT 6.2", "EDT 6.3") para que no se mezclen las fotos.
// Ojo: si este script se despliega con la misma cuenta de Google que
// Control_VeranoEnergy, comparten la carpeta base por nombre (pero cada uno
// escribe en sus propias subcarpetas).
function _obtenerCarpeta(codigoEdt) {
  const it = DriveApp.getFoldersByName(CARPETA_FOTOS);
  const base = it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_FOTOS);
  if (!codigoEdt) return base;
  const nombreSub = 'EDT ' + codigoEdt;
  const itSub = base.getFoldersByName(nombreSub);
  return itSub.hasNext() ? itSub.next() : base.createFolder(nombreSub);
}

// Guarda la foto (dataURL base64) y devuelve su URL. Idempotente por nombre: si
// ya existe el archivo, reutiliza el que está en vez de duplicarlo.
function _guardarFoto(carpeta, dataUrl, nombreBase) {
  try {
    const nombre = nombreBase + '.jpg';
    const existentes = carpeta.getFilesByName(nombre);
    if (existentes.hasNext()) return existentes.next().getUrl();
    const partes = String(dataUrl).split(',');
    const bytes = Utilities.base64Decode(partes[1] || partes[0]);
    const blob = Utilities.newBlob(bytes, 'image/jpeg', nombre);
    const archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return archivo.getUrl();
  } catch (err) {
    return 'ERROR_FOTO: ' + err;
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
