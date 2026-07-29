// Sincronización de los registros individuales (6.1/6.2/6.3) con el Web App de
// Apps Script propio de esta app — una planilla de Google Sheets SEPARADA de la
// que usa el formulario de avance agregado (Control_VeranoEnergy). Cada
// registro viaja como { tipo: 'registro_individual', codigo_edt, record_id,
// registro: {...}, detalle: [...] } — el backend crea/actualiza las hojas
// Registros_6.x + Indicios_6.1/6.2 o Individuos_6.3, sube las fotos a Drive y
// hace upsert idempotente por record_id.
import * as DB from './db.js';

const URL_KEY = 'verano-energy-registros-sync-url';

// URL del Web App de Apps Script desplegado sobre la planilla de "Registros de
// terreno" (distinta de la planilla de avance agregado). Ese script es una copia
// de apps-script/Codigo.gs con su propio SPREADSHEET_ID.
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwZXGXuhwVcwpUVdZgZBCNxFml6qe2TnRfswGROmSTyK-Ts8SBFhH_gzIQm3lt5M9nPBA/exec';

export function getUrl() {
  return localStorage.getItem(URL_KEY) || DEFAULT_URL;
}

export function setUrl(url) {
  localStorage.setItem(URL_KEY, url.trim());
}

// Campos del registro principal según el EDT (sin id/sincronizado ni la sub-lista).
function camposRegistro(edt) {
  const comunes = ['record_id', 'proyecto_id', 'nombre_proyecto', 'zona', 'fecha', 'evaluadora',
    'numero_unidad', 'utm_este', 'utm_norte', 'huso', 'foto', 'observaciones',
    'fecha_creacion', 'fecha_ultima_modificacion'];
  if (edt === '6.1') return [...comunes, 'codigo_gps_zona', 'presencia_vegetacion_acompanante', 'presencia_curureras'];
  if (edt === '6.2') return [...comunes, 'codigo_gps_parcela', 'tipo_vegetacion', 'tipo_vegetacion_otro', 'especies', 'presencia_curureras'];
  return [...comunes, 'codigo_gps_calicata', 'presencia_geofita']; // 6.3
}

function filaRegistro(edt, reg) {
  const fila = {};
  camposRegistro(edt).forEach((c) => { fila[c] = reg[c] ?? null; });
  return fila;
}

function filaDetalle(edt, reg) {
  return edt === '6.3' ? (reg.individuos || []) : (reg.indicios || []);
}

async function enviarUno(url, edt, reg) {
  const payload = {
    tipo: 'registro_individual',
    codigo_edt: edt,
    record_id: reg.record_id,
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
    // Los borradores nunca se sincronizan: solo registros ya marcados como listos.
    const pend = todos.filter((r) => !r.sincronizado && r.estado_sync !== 'BORRADOR');
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
