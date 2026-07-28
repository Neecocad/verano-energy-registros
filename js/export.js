// Exportación de los registros individuales (6.1/6.2/6.3): Excel multi-hoja y respaldo JSON.
import { buildXlsx } from './xlsx-mini.js';

function fecha() {
  return new Date().toISOString().slice(0, 10);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function fechaCorta(iso) {
  return iso ? iso.slice(0, 19).replace('T', ' ') : '';
}

function ordenar(regs) {
  return [...regs].sort(
    (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.numero_unidad || 0) - (b.numero_unidad || 0)
  );
}

// ---------- 6.1 · Zona y Transecto ----------
function hojaRegistros61(regs) {
  const head = ['Zona', 'Fecha', 'Evaluadora', 'N° Transecto', 'UTM Este', 'UTM Norte', 'Huso',
    'Código GPS zona', 'Vegetación acompañante', 'Curureras', 'Foto', 'N° indicios',
    'Observaciones', 'Estado sincronización', 'Fecha creación', 'record_id'];
  const rows = [head];
  for (const r of ordenar(regs)) {
    rows.push([r.zona, r.fecha, r.evaluadora, r.numero_unidad, r.utm_este ?? '', r.utm_norte ?? '', r.huso ?? '',
      r.codigo_gps_zona || '', r.presencia_vegetacion_acompanante || '', r.presencia_curureras || '',
      r.foto ? 'Sí' : 'No', (r.indicios || []).length, r.observaciones || '',
      r.estado_sincronizacion || 'Pendiente', fechaCorta(r.fecha_creacion), r.record_id]);
  }
  return rows;
}

function hojaIndicios(regs, tituloUnidad) {
  const head = [tituloUnidad, 'Zona', 'N° indicio', 'UTM Este', 'UTM Norte', 'Huso',
    'Código GPS indicio', 'Foto', 'Observaciones', 'record_id (padre)'];
  const rows = [head];
  for (const r of ordenar(regs)) {
    for (const ind of r.indicios || []) {
      rows.push([r.numero_unidad, r.zona, ind.numero_indicio, ind.utm_este ?? '', ind.utm_norte ?? '', ind.huso ?? '',
        ind.codigo_gps_indicio || '', ind.foto ? 'Sí' : 'No', ind.observaciones || '', r.record_id]);
    }
  }
  return rows;
}

// ---------- 6.2 · Parcela ----------
function hojaRegistros62(regs) {
  const head = ['Zona', 'Fecha', 'Evaluadora', 'N° Parcela', 'UTM Este', 'UTM Norte', 'Huso',
    'Código GPS parcela', 'Tipo de vegetación', 'Otro (especificar)', 'Especies (con % cobertura)',
    'Curureras', 'Foto', 'N° indicios', 'Observaciones', 'Estado sincronización', 'Fecha creación', 'record_id'];
  const rows = [head];
  for (const r of ordenar(regs)) {
    rows.push([r.zona, r.fecha, r.evaluadora, r.numero_unidad, r.utm_este ?? '', r.utm_norte ?? '', r.huso ?? '',
      r.codigo_gps_parcela || '', r.tipo_vegetacion || '', r.tipo_vegetacion_otro || '', r.especies || '',
      r.presencia_curureras || '', r.foto ? 'Sí' : 'No', (r.indicios || []).length, r.observaciones || '',
      r.estado_sincronizacion || 'Pendiente', fechaCorta(r.fecha_creacion), r.record_id]);
  }
  return rows;
}

// ---------- 6.3 · Calicatas ----------
function hojaRegistros63(regs) {
  const head = ['Zona', 'Fecha', 'Evaluadora', 'N° Calicata', 'UTM Este', 'UTM Norte', 'Huso',
    'Código GPS calicata', 'Presencia de geófita', 'Foto', 'N° individuos', 'Observaciones',
    'Estado sincronización', 'Fecha creación', 'record_id'];
  const rows = [head];
  for (const r of ordenar(regs)) {
    rows.push([r.zona, r.fecha, r.evaluadora, r.numero_unidad, r.utm_este ?? '', r.utm_norte ?? '', r.huso ?? '',
      r.codigo_gps_calicata || '', r.presencia_geofita || '', r.foto ? 'Sí' : 'No', (r.individuos || []).length,
      r.observaciones || '', r.estado_sincronizacion || 'Pendiente', fechaCorta(r.fecha_creacion), r.record_id]);
  }
  return rows;
}

function hojaIndividuos(regs) {
  const head = ['N° Calicata', 'Zona', 'N° Individuo', 'Profundidad hallazgo (cm)', 'Estado fenológico',
    'Estado sanitario', 'Foto', 'record_id (padre)'];
  const rows = [head];
  for (const r of ordenar(regs)) {
    for (const ind of r.individuos || []) {
      rows.push([r.numero_unidad, r.zona, ind.numero_individuo, ind.profundidad_cm ?? '', ind.estado_fenologico || '',
        ind.estado_sanitario || '', ind.foto ? 'Sí' : 'No', r.record_id]);
    }
  }
  return rows;
}

// `todos` = { '6.1': [...], '6.2': [...], '6.3': [...] } — ver DB.getTodosLosRegistros().
export async function exportarExcel(todos) {
  const blob = buildXlsx([
    { name: 'Registros 6.1', rows: hojaRegistros61(todos['6.1']) },
    { name: 'Indicios 6.1', rows: hojaIndicios(todos['6.1'], 'N° Transecto') },
    { name: 'Registros 6.2', rows: hojaRegistros62(todos['6.2']) },
    { name: 'Indicios 6.2', rows: hojaIndicios(todos['6.2'], 'N° Parcela') },
    { name: 'Registros 6.3', rows: hojaRegistros63(todos['6.3']) },
    { name: 'Individuos 6.3', rows: hojaIndividuos(todos['6.3']) },
  ]);
  download(blob, `VeranoEnergy_Registros_${fecha()}.xlsx`);
}

// Respaldo completo (todos los campos, incluidas fotos en base64) para reimportar o resincronizar.
export async function exportarRespaldo(todos) {
  const blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), registros: todos }, null, 2)],
    { type: 'application/json' });
  download(blob, `VeranoEnergy_Respaldo_Registros_${fecha()}.json`);
}
