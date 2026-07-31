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
// Planilla "Verano Energy" (la que también recibe el avance agregado del repo
// Control_VeranoEnergy: son hojas distintas dentro del mismo archivo).
const SPREADSHEET_ID = '1YjNRN66YVn0t7dYsEyp4rIe3mSsIlMyVQMao3VQ5m6U';

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

// ---------- KPI de seguimiento y control (uso interno) ----------
// Hoja "KPI" con fórmulas vivas: se recalcula sola cada vez que se abre o
// sincroniza la planilla, sin volver a correr el script. Lee las hojas de esta
// app y, cuando existe, también Datos_Avance (que escribe el Web App de
// Control_VeranoEnergy en esta misma planilla) para las horas-hombre.
const SHEET_KPI = 'KPI';
const SHEET_AVANCE = 'Datos_Avance'; // la escribe la otra app; puede no existir aún
// Posición de 'horas_hombre' en el esquema COLUMNAS de Datos_Avance
// (Control_VeranoEnergy). Si allá cambia el orden de columnas, hay que
// actualizar este número.
const COL_HH_AVANCE = 16;

// Subir KPI_VERSION regenera las fórmulas en las planillas ya creadas,
// conservando los parámetros que el equipo haya escrito a mano.
const KPI_VERSION = 1;

const META_POR_EDT = 177; // 1 unidad por hectárea
const PONDERACION = { '6.1': 0.3333, '6.2': 0.3333, '6.3': 0.3334 };

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
    const res = _registrarIndividual(ss, payload);
    // El KPI es accesorio: si falla al construirse, el registro ya quedó escrito
    // y el sync no debe darse por fallido (el celular lo reintentaría y el
    // equipo creería que perdió datos). Se informa aparte.
    try {
      _asegurarKPI(ss);
    } catch (err) {
      res.kpi_error = String(err && err.message ? err.message : err);
    }
    return _json(res);
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

// ---------- Hoja KPI ----------

function _colLetra(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Referencia de columna abierta ("'Registros_6.2'!H2:H") calculada desde el
// esquema, no escrita a mano: si cambia el orden de las columnas, las fórmulas
// del KPI siguen apuntando al campo correcto.
function _refReg(edt, campo) {
  const cfg = CONFIG_INDIVIDUAL[edt];
  const letra = _colLetra(cfg.colReg.indexOf(campo) + 1);
  return "'" + cfg.hojaReg + "'!" + letra + '2:' + letra;
}

function _refDet(edt, campo) {
  const cfg = CONFIG_INDIVIDUAL[edt];
  const letra = _colLetra(cfg.colDet.indexOf(campo) + 1);
  return "'" + cfg.hojaDet + "'!" + letra + '2:' + letra;
}

// Une la misma columna de los 3 EDT en un solo rango vertical, para los KPI
// que miran el proyecto completo.
function _refTodos(campo) {
  return '{' + ['6.1', '6.2', '6.3'].map(function (e) { return _refReg(e, campo); }).join(';') + '}';
}

// Horas-hombre desde Datos_Avance, que escribe la otra app. Puede no existir
// todavía, así que toda referencia va envuelta en IFERROR.
function _refAvance(letra) {
  return "'" + SHEET_AVANCE + "'!" + letra + '2:' + letra;
}

function _asegurarKPI(ss) {
  const sheet = _hoja(ss, SHEET_KPI);
  const versionActual = sheet.getLastRow() > 0 ? sheet.getRange('H1').getValue() : null;
  if (versionActual === KPI_VERSION) return; // ya está al día; las fórmulas se recalculan solas

  // Las hojas de datos deben existir antes que las fórmulas que las referencian,
  // o el KPI mostraría #REF hasta el primer sync de cada EDT.
  ['6.1', '6.2', '6.3'].forEach(function (edt) {
    const cfg = CONFIG_INDIVIDUAL[edt];
    _asegurarEncabezado(_hoja(ss, cfg.hojaReg), cfg.colReg);
    _asegurarEncabezado(_hoja(ss, cfg.hojaDet), cfg.colDet);
  });

  // Parámetros escritos a mano por el equipo: se conservan al regenerar. La
  // condición mira si la hoja tiene contenido, no el número de versión: una
  // versión 0 es un valor válido y no debe descartar lo ya escrito.
  const paramsPrevios = sheet.getLastRow() > 0 ? _leerParametrosKPI(sheet) : {};
  sheet.clear();
  _construirKPI(sheet, paramsPrevios);
  sheet.getRange('H1').setValue(KPI_VERSION);
  sheet.hideColumns(8); // la celda de versión no es parte del informe
}

// Los parámetros viven en B por etiqueta (columna A), así que se recuperan por
// nombre y no por posición: mover una sección no los pierde.
function _leerParametrosKPI(sheet) {
  const filas = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  const out = {};
  filas.forEach(function (f) {
    const etiqueta = String(f[0]).trim();
    if (etiqueta && f[1] !== '' && f[1] !== null) out[etiqueta] = f[1];
  });
  return out;
}

function _construirKPI(sheet, prev) {
  const CLP = '#,##0 [$CLP]';
  const PCT = '0.0%';
  const NUM = '#,##0.0';
  const filas = [];
  const formatos = []; // { fila (1-based), col, formato }
  const titulos = [];  // filas de encabezado de sección
  const cabeceras = [];

  function fila(vals) { filas.push(vals); return filas.length; }
  function seccion(txt) { const r = fila([txt]); titulos.push(r); return r; }
  function cabecera(vals) { const r = fila(vals); cabeceras.push(r); return r; }
  function fmt(r, c, f) { formatos.push({ r: r, c: c, f: f }); }
  // Valor previo del parámetro, si el equipo ya lo había escrito.
  function param(etiqueta) { return prev[etiqueta] !== undefined ? prev[etiqueta] : ''; }

  const unidad = { '6.1': 'Transecto', '6.2': 'Parcela', '6.3': 'Calicata' };

  // Unidades distintas realmente levantadas (no filas): si una unidad se
  // registró dos veces por error, cuenta una sola vez contra la meta.
  const unicas = {};
  const registros = {};
  ['6.1', '6.2', '6.3'].forEach(function (e) {
    unicas[e] = 'COUNTUNIQUE(' + _refReg(e, 'numero_unidad') + ')';
    registros[e] = 'COUNTA(' + _refReg(e, 'record_id') + ')';
  });

  fila(['KPI · Verano Energy — Seguimiento y control']);
  fila(['Uso interno. Se recalcula solo: no hace falta volver a correr el script.']);
  fila([]);

  // ---------------- Parámetros ----------------
  seccion('PARÁMETROS — complétalos a mano (se conservan al actualizar)');
  const pVal = {};
  ['6.1', '6.2', '6.3'].forEach(function (e) {
    const etiqueta = 'Valor unitario ' + e + ' (CLP por ' + unidad[e].toLowerCase() + ')';
    const r = fila([etiqueta, param(etiqueta)]);
    fmt(r, 2, CLP);
    pVal[e] = 'B' + r;
  });
  const rContrato = fila(['Monto total del contrato (CLP)', param('Monto total del contrato (CLP)')]);
  fmt(rContrato, 2, CLP);
  const rValorHH = fila(['Valor hora-hombre (CLP por HH)', param('Valor hora-hombre (CLP por HH)')]);
  fmt(rValorHH, 2, CLP);
  fila([]);

  // ---------------- Avance vs meta ----------------
  seccion('AVANCE VS META');
  cabecera(['EDT', 'Unidad', 'Meta', 'Registros', 'Unidades levantadas', '% avance',
    'Ponderación', 'Aporte ponderado', 'Último registro']);
  const rAvance0 = filas.length + 1;
  ['6.1', '6.2', '6.3'].forEach(function (e) {
    const r = filas.length + 1;
    fila([e, unidad[e], META_POR_EDT,
      '=' + registros[e],
      '=' + unicas[e],
      '=IFERROR(E' + r + '/C' + r + ',0)',
      PONDERACION[e],
      '=F' + r + '*G' + r,
      '=IFERROR(TEXT(MAX(' + _refReg(e, 'fecha') + '),"yyyy-mm-dd"),"—")']);
    fmt(r, 6, PCT); fmt(r, 7, PCT); fmt(r, 8, PCT);
  });
  const rAvance1 = filas.length;
  const rTotalAvance = fila(['TOTAL', '', '=SUM(C' + rAvance0 + ':C' + rAvance1 + ')',
    '=SUM(D' + rAvance0 + ':D' + rAvance1 + ')', '=SUM(E' + rAvance0 + ':E' + rAvance1 + ')',
    '=IFERROR(E' + (rAvance1 + 1) + '/C' + (rAvance1 + 1) + ',0)',
    '=SUM(G' + rAvance0 + ':G' + rAvance1 + ')',
    '=SUM(H' + rAvance0 + ':H' + rAvance1 + ')', '']);
  fmt(rTotalAvance, 6, PCT); fmt(rTotalAvance, 7, PCT); fmt(rTotalAvance, 8, PCT);
  fila([]);

  // ---------------- Valorización ----------------
  seccion('VALORIZACIÓN DEL SERVICIO — requiere los parámetros de arriba');
  cabecera(['EDT', 'Unidades levantadas', 'Valor unitario', 'Monto ejecutado', '% de la meta valorizado']);
  const rVal0 = filas.length + 1;
  ['6.1', '6.2', '6.3'].forEach(function (e) {
    const r = filas.length + 1;
    fila([e, '=' + unicas[e], '=' + pVal[e], '=IFERROR(B' + r + '*C' + r + ',0)',
      '=IFERROR(B' + r + '/' + META_POR_EDT + ',0)']);
    fmt(r, 3, CLP); fmt(r, 4, CLP); fmt(r, 5, PCT);
  });
  const rVal1 = filas.length;
  const rTotalVal = fila(['Monto ejecutado total', '', '', '=SUM(D' + rVal0 + ':D' + rVal1 + ')', '']);
  fmt(rTotalVal, 4, CLP);
  const rPctContrato = fila(['% del contrato ejecutado', '', '',
    '=IFERROR(D' + rTotalVal + '/B' + rContrato + ',0)', '']);
  fmt(rPctContrato, 4, PCT);
  const rSaldo = fila(['Saldo por ejecutar', '', '',
    '=IFERROR(B' + rContrato + '-D' + rTotalVal + ',0)', '']);
  fmt(rSaldo, 4, CLP);
  // Valorización según avance ponderado: útil como contraste con la suma por
  // unidad cuando el contrato se paga por hitos y no por unidad ejecutada.
  const rPonderado = fila(['Monto según avance ponderado', '', '',
    '=IFERROR(H' + rTotalAvance + '*B' + rContrato + ',0)', '']);
  fmt(rPonderado, 4, CLP);
  fila([]);

  // ---------------- Productividad ----------------
  seccion('PRODUCTIVIDAD');
  const diasRef = 'COUNTUNIQUE(' + _refTodos('fecha') + ')';
  const rDias = fila(['Días efectivos en terreno', '=' + diasRef]);
  const rTotalUnid = fila(['Unidades levantadas (total)', '=E' + rTotalAvance]);
  const rPorDia = fila(['Unidades por día efectivo', '=IFERROR(B' + rTotalUnid + '/B' + rDias + ',0)']);
  fmt(rPorDia, 2, NUM);
  const ultimos7 = ['6.1', '6.2', '6.3'].map(function (e) {
    return 'COUNTIF(' + _refReg(e, 'fecha') + ',">="&TODAY()-7)';
  }).join('+');
  const rRitmo = fila(['Unidades en los últimos 7 días', '=' + ultimos7]);
  const rRestantes = fila(['Unidades restantes', '=C' + rTotalAvance + '-B' + rTotalUnid]);
  const rDiasFalta = fila(['Días efectivos estimados para terminar',
    '=IFERROR(IF(B' + rPorDia + '=0,"—",ROUNDUP(B' + rRestantes + '/B' + rPorDia + ')),"—")']);
  fmt(rDiasFalta, 2, NUM);
  // Horas-hombre: solo existen si la otra app ya sincronizó avance agregado.
  const rHH = fila(['Horas-hombre acumuladas (Datos_Avance)',
    '=IFERROR(SUM(' + _refAvance(_colLetra(COL_HH_AVANCE)) + '),0)']);
  fmt(rHH, 2, NUM);
  const rHHUnidad = fila(['Horas-hombre por unidad',
    '=IFERROR(B' + rHH + '/B' + rTotalUnid + ',0)']);
  fmt(rHHUnidad, 2, NUM);
  const rCostoHH = fila(['Costo estimado en HH (CLP)',
    '=IFERROR(B' + rHH + '*B' + rValorHH + ',0)']);
  fmt(rCostoHH, 2, CLP);
  const rMargen = fila(['Margen estimado (ejecutado − costo HH)',
    '=IFERROR(D' + rTotalVal + '-B' + rCostoHH + ',0)']);
  fmt(rMargen, 2, CLP);
  fila([]);

  // ---------------- Calidad del dato ----------------
  seccion('CALIDAD DEL DATO');
  cabecera(['EDT', 'Registros', 'Unidades levantadas', 'Duplicados', 'Faltan para la meta',
    '% con foto', '% con GPS']);
  ['6.1', '6.2', '6.3'].forEach(function (e) {
    const r = filas.length + 1;
    fila([e, '=' + registros[e], '=' + unicas[e], '=B' + r + '-C' + r,
      '=' + META_POR_EDT + '-C' + r,
      '=IFERROR(COUNTIF(' + _refReg(e, 'foto_url') + ',"?*")/B' + r + ',0)',
      '=IFERROR(COUNT(' + _refReg(e, 'utm_este') + ')/B' + r + ',0)']);
    fmt(r, 6, PCT); fmt(r, 7, PCT);
  });
  fila([]);

  // ---------------- Hallazgos ----------------
  seccion('HALLAZGOS ECOLÓGICOS');
  const rInd61 = fila(['6.1 · Indicios registrados', '=COUNTA(' + _refDet('6.1', 'numero_indicio') + ')']);
  const rInd61x = fila(['6.1 · Indicios por transecto',
    '=IFERROR(B' + rInd61 + '/E' + rAvance0 + ',0)']);
  fmt(rInd61x, 2, NUM);
  const tipoFila = _refDet('6.2', 'tipo_fila');
  const rEsp62 = fila(['6.2 · Especies registradas', '=COUNTIF(' + tipoFila + ',"ESPECIE")']);
  const rEspU = fila(['6.2 · Especies distintas',
    '=IFERROR(COUNTUNIQUE(FILTER(' + _refDet('6.2', 'nombre_especie') + ',' + tipoFila + '="ESPECIE")),0)']);
  const rCob = fila(['6.2 · Cobertura media por especie (%)',
    '=IFERROR(AVERAGEIF(' + tipoFila + ',"ESPECIE",' + _refDet('6.2', 'cobertura_porcentaje') + '),0)']);
  fmt(rCob, 2, NUM);
  const rInd62 = fila(['6.2 · Indicios registrados', '=COUNTIF(' + tipoFila + ',"INDICIO")']);
  const rCur = fila(['6.2 · Parcelas con curureras',
    '=IFERROR(COUNTIF(' + _refReg('6.2', 'presencia_curureras') + ',"Sí")/D' + (rAvance0 + 1) + ',0)']);
  fmt(rCur, 2, PCT);
  const rGeo = fila(['6.3 · Calicatas con geófita',
    '=IFERROR(COUNTIF(' + _refReg('6.3', 'presencia_geofita') + ',"Sí")/D' + (rAvance0 + 2) + ',0)']);
  fmt(rGeo, 2, PCT);
  const rIndiv = fila(['6.3 · Individuos de geófita registrados',
    '=COUNTA(' + _refDet('6.3', 'numero_individuo') + ')']);
  const rIndivX = fila(['6.3 · Individuos por calicata',
    '=IFERROR(B' + rIndiv + '/E' + (rAvance0 + 2) + ',0)']);
  fmt(rIndivX, 2, NUM);
  fila([]);

  // ---------------- Por persona evaluadora ----------------
  // QUERY se expande solo, así que va al final: crece con el equipo sin pisar
  // ninguna sección de arriba.
  seccion('POR PERSONA EVALUADORA (se expande solo)');
  fila(['=IFERROR(QUERY(' + _refTodos('evaluadora')
    + ',"select Col1, count(Col1) where Col1 is not null and Col1 <> \'\' '
    + 'group by Col1 order by count(Col1) desc label Col1 \'Persona evaluadora\', count(Col1) \'Unidades\'",0)'
    + ',"Sin registros todavía")']);

  // ---- Escritura ----
  const ancho = Math.max.apply(null, filas.map(function (f) { return f.length; }));
  const matriz = filas.map(function (f) {
    const copia = f.slice();
    while (copia.length < ancho) copia.push('');
    return copia;
  });
  sheet.getRange(1, 1, matriz.length, ancho).setValues(matriz);

  sheet.getRange('A1').setFontSize(14).setFontWeight('bold');
  sheet.getRange('A2').setFontColor('#666666');
  titulos.forEach(function (r) {
    sheet.getRange(r, 1, 1, ancho).setFontWeight('bold').setBackground('#0f5e9c').setFontColor('#ffffff');
  });
  cabeceras.forEach(function (r) {
    sheet.getRange(r, 1, 1, ancho).setFontWeight('bold').setBackground('#eff8ff');
  });
  formatos.forEach(function (f) { sheet.getRange(f.r, f.c).setNumberFormat(f.f); });
  sheet.setColumnWidth(1, 320);
  sheet.setFrozenRows(2);
}
