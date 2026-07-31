// Sincronización de los registros individuales (6.1/6.2/6.3) con el Web App de
// Apps Script propio de esta app — una planilla de Google Sheets SEPARADA de la
// que usa el formulario de avance agregado (Control_VeranoEnergy). Cada
// registro viaja como { tipo: 'registro_individual', codigo_edt, record_id,
// registro: {...}, detalle: [...] } — el backend crea/actualiza las hojas
// Registros_6.x + Indicios_6.1/6.2 o Individuos_6.3, sube las fotos a Drive y
// hace upsert idempotente por record_id.
import * as DB from './db.js';

// La URL que el equipo haya escrito a mano en "Exportar → URL de sincronización"
// queda guardada en el navegador del celular y tiene prioridad sobre DEFAULT_URL.
// Eso es útil para pruebas, pero se vuelve una trampa cuando el deployment
// cambia: ese celular seguiría enviando al Web App antiguo aunque la app se
// actualice, y nadie lo notaría porque el sync responde "ok".
//
// Por eso la clave lleva sufijo de versión: al cambiar de deployment se sube el
// sufijo, lo guardado bajo la clave anterior deja de leerse y DEFAULT_URL vuelve
// a mandar en todos los equipos, sin que nadie tenga que tocar su teléfono.
const URL_KEY = 'verano-energy-registros-sync-url-v2';
const URL_KEYS_ANTIGUAS = ['verano-energy-registros-sync-url'];

// URL del Web App de Apps Script desplegado sobre la planilla "Verano Energy"
// (apps-script/Codigo.gs de este repo). Es la misma planilla donde sincroniza el
// avance agregado, pero otro deployment y otras hojas.
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbx_kfvI8WLONHog_k35tUvoz_BkVJlhbxB8d4iGWhuIPm0ODku8W2sceKxRAEW0x5x5Vg/exec';

// Se limpian las claves viejas para que no queden URLs muertas dando vueltas en
// el almacenamiento del navegador.
try {
  URL_KEYS_ANTIGUAS.forEach((k) => localStorage.removeItem(k));
} catch (_) { /* almacenamiento bloqueado: no es crítico */ }

export function getUrl() {
  return localStorage.getItem(URL_KEY) || DEFAULT_URL;
}

export function setUrl(url) {
  localStorage.setItem(URL_KEY, url.trim());
}

// Permite volver al valor que trae la app, si alguien pegó una URL equivocada.
export function resetUrl() {
  localStorage.removeItem(URL_KEY);
  return DEFAULT_URL;
}

// Campos del registro principal según el EDT (sin id/sincronizado ni la sub-lista).
function camposRegistro(edt) {
  const comunes = ['record_id', 'proyecto_id', 'nombre_proyecto', 'zona', 'fecha', 'evaluadora',
    'numero_unidad', 'utm_este', 'utm_norte', 'huso', 'foto', 'observaciones',
    'fecha_creacion', 'fecha_ultima_modificacion'];
  if (edt === '6.1') return [...comunes, 'codigo_gps_zona', 'presencia_vegetacion_acompanante', 'presencia_curureras'];
  if (edt === '6.2') {
    return [...comunes, 'parcela_id', 'codigo_parcela', 'codigo_gps_parcela', 'tipo_vegetacion',
      'tipo_vegetacion_otro', 'presencia_curureras', 'ultimo_numero_especie', 'ultimo_numero_indicio'];
  }
  return [...comunes, 'codigo_gps_calicata', 'presencia_geofita']; // 6.3
}

function filaRegistro(edt, reg) {
  const fila = {};
  camposRegistro(edt).forEach((c) => { fila[c] = reg[c] ?? null; });
  // Registros de la versión anterior guardaban las especies como texto libre en
  // `especies`; se mantiene esa columna para no perderlos. En los registros
  // nuevos las especies son elementos y viajan en el detalle, así que va vacía.
  if (edt === '6.2') fila.especies = typeof reg.especies === 'string' ? reg.especies : '';
  return fila;
}

// Columnas de la hoja Elementos_6.2 — mismas claves para especies e indicios,
// vacías donde no aplican, para que cada elemento sea UNA fila homogénea.
const COLUMNAS_ELEMENTO = ['elemento_id', 'codigo_parcela', 'tipo_fila', 'numero_elemento', 'codigo_elemento',
  'nombre_especie', 'cobertura_porcentaje', 'observaciones_especie',
  'tipo_indicio', 'tipo_indicio_otro', 'utm_este', 'utm_norte', 'huso', 'codigo_gps_indicio',
  'observaciones_indicio', 'foto'];

function filaElemento(reg, el) {
  const fila = {};
  COLUMNAS_ELEMENTO.forEach((c) => { fila[c] = el[c] ?? ''; });
  fila.codigo_parcela = el.codigo_parcela || reg.codigo_parcela || '';
  // Indicios guardados antes del cambio usaban `observaciones` a secas.
  if (!fila.observaciones_indicio && el.observaciones) fila.observaciones_indicio = el.observaciones;
  fila.foto = el.foto || null;
  return fila;
}

// Una fila por elemento, sin combinar tipos ni cruzarlos: 3 especies + 2
// indicios = 5 filas.
function detalleParcela(reg) {
  const especies = Array.isArray(reg.especies) ? reg.especies : [];
  const indicios = reg.indicios || [];
  return [...especies, ...indicios].map((el) => filaElemento(reg, el));
}

function filaDetalle(edt, reg) {
  if (edt === '6.3') return reg.individuos || [];
  if (edt === '6.2') return detalleParcela(reg);
  return reg.indicios || [];
}

// Hoja de destino del detalle. En 6.2 el detalle dejó de ser solo indicios: son
// "elementos" (especies + indicios) y van a su propia hoja.
function hojaDetalle(edt) {
  if (edt === '6.1') return 'Indicios_6.1';
  if (edt === '6.2') return 'Elementos_6.2';
  return 'Individuos_6.3';
}

async function enviarUno(url, edt, reg) {
  const payload = {
    tipo: 'registro_individual',
    codigo_edt: edt,
    record_id: reg.record_id,
    hoja_detalle: hojaDetalle(edt),
    registro: filaRegistro(edt, reg),
    detalle: filaDetalle(edt, reg),
  };
  const body = 'data=' + encodeURIComponent(JSON.stringify(payload));
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    throw new Error('Respuesta no válida (¿la implementación es "Cualquier persona"?)');
  }
  if (data.status !== 'ok') throw new Error(data.mensaje || data.error || 'Error del servidor');
}

export async function sincronizar(onProgress) {
  const url = getUrl();
  if (!url) throw new Error('Configura primero la URL de sincronización.');

  const EDTS = ['6.1', '6.2', '6.3'];
  const pendientesPorEdt = {};
  let total = 0;
  for (const edt of EDTS) {
    const todos = await DB.getRegistros(edt);
    const pend = todos.filter((r) => !r.sincronizado);
    pendientesPorEdt[edt] = pend;
    total += pend.length;
  }
  if (!total) return { enviados: 0, total: 0 };

  let enviados = 0;
  for (const edt of EDTS) {
    for (const reg of pendientesPorEdt[edt]) {
      await enviarUno(url, edt, reg);
      reg.estado_sincronizacion = 'Sincronizado';
      reg.fecha_sincronizacion = new Date().toISOString();
      reg.sincronizado = 1;
      await DB.updateRegistro(edt, reg);
      enviados++;
      if (onProgress) onProgress(enviados, total);
    }
  }
  return { enviados, total };
}
