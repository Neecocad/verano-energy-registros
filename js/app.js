// Lógica principal — Verano Energy: registros individuales por EDT (6.1/6.2/6.3).
// Cada formulario captura GPS + fotografía georreferenciada del punto principal,
// más una lista repetible de indicios (6.1/6.2) o individuos (6.3), cada uno con
// su propio GPS/foto cuando corresponde.
import * as DB from './db.js';
import { latLonToUTM } from './utm.js';
import * as XP from './export.js';
import * as SYNC from './sync.js';
import {
  PROYECTO, RESPONSABLES, TOTAL_UNIDADES,
  TIPOS_VEGETACION, ESTADOS_FENOLOGICOS, ESTADOS_SANITARIOS, FORMULARIOS,
} from './catalog.js';

const VERSION = 'v1';
const EDTS = ['6.1', '6.2', '6.3'];

const $ = (id) => document.getElementById(id);

// ---------- Utilidades UI ----------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function seccionDe(edt) {
  const id = 'view-edt' + edt.replace('.', '');
  return document.getElementById(id);
}

function formDe(edt) {
  return seccionDe(edt).querySelector('.reg-form');
}

// ---------- GPS ----------
function capturarGPS(btn, accEl) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { toast('GPS no disponible en este dispositivo'); resolve(null); return; }
    const original = btn.textContent;
    btn.textContent = '📍 Capturando…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const utm = latLonToUTM(latitude, longitude);
        if (accEl) accEl.textContent = `Huso ${utm.huso} · ±${Math.round(accuracy)} m`;
        btn.textContent = '📍 Recapturar GPS';
        toast('Coordenadas capturadas');
        resolve({ ...utm, accuracy });
      },
      (err) => {
        btn.textContent = original;
        toast('Error GPS: ' + err.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ---------- Fotografía con geo-sello ----------
function tomarFoto(file, lineas) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const fs = Math.max(14, Math.round(h * 0.028));
        ctx.font = `bold ${fs}px sans-serif`;
        const pad = fs * 0.5;
        const lineH = fs * 1.35;
        const boxH = lineH * lineas.length + pad;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, h - boxH, w, boxH);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        lineas.forEach((ln, i) => ctx.fillText(ln, pad, h - boxH + pad / 2 + i * lineH));

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function buildLineas(form, utm, etiqueta) {
  const edt = form.dataset.edt;
  const cfg = FORMULARIOS[edt];
  const numero = form.querySelector('[data-f="numero_unidad"]').value;
  const lineas = [`Proyecto: ${PROYECTO.nombre_proyecto}`, `${cfg.codigo_edt} · ${cfg.unidad_singular} ${numero || '—'}`];
  if (etiqueta) lineas.push(etiqueta);
  const evaluadora = form.querySelector('[data-f="evaluadora"]').value;
  if (evaluadora) lineas.push(`Evaluadora: ${evaluadora}`);
  lineas.push(new Date().toLocaleString('es-CL'));
  if (utm) lineas.push(`UTM ${utm.huso}: ${utm.x} E, ${utm.y} N`);
  return lineas;
}

// ---------- Wiring: punto principal del formulario ----------
function wireMainGps(form) {
  const btn = form.querySelector('[data-gps-main]');
  const acc = form.querySelector('[data-gps-acc]');
  btn.addEventListener('click', async () => {
    const utm = await capturarGPS(btn, acc);
    if (utm) {
      form._gpsMain = utm;
      form.querySelector('[data-f="utm_este"]').value = utm.x;
      form.querySelector('[data-f="utm_norte"]').value = utm.y;
    }
  });
}

function wireMainFoto(form) {
  const btn = form.querySelector('[data-foto-main]');
  const input = form.querySelector('[data-foto-input-main]');
  const preview = form.querySelector('[data-foto-preview-main]');
  const img = form.querySelector('[data-foto-img-main]');
  const del = form.querySelector('[data-foto-del-main]');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await tomarFoto(file, buildLineas(form, form._gpsMain || null, null));
    form._fotoMain = dataUrl;
    img.src = dataUrl;
    preview.classList.remove('hidden');
  });
  del.addEventListener('click', () => {
    form._fotoMain = null;
    input.value = '';
    preview.classList.add('hidden');
  });
}

// ---------- Wiring: bloques repetibles (indicio / individuo) ----------
function wireSubGps(clone) {
  const btn = clone.querySelector('[data-gps]');
  const acc = clone.querySelector('[data-gps-acc]');
  btn.addEventListener('click', async () => {
    const utm = await capturarGPS(btn, acc);
    if (utm) clone._gps = utm;
  });
}

function wireSubFoto(clone, form, etiqueta) {
  const btn = clone.querySelector('[data-foto]');
  const input = clone.querySelector('[data-foto-input]');
  const preview = clone.querySelector('[data-foto-preview]');
  const img = clone.querySelector('[data-foto-img]');
  const del = clone.querySelector('[data-foto-del]');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await tomarFoto(file, buildLineas(form, clone._gps || null, etiqueta()));
    clone._foto = dataUrl;
    img.src = dataUrl;
    preview.classList.remove('hidden');
  });
  del.addEventListener('click', () => {
    clone._foto = null;
    input.value = '';
    preview.classList.add('hidden');
  });
}

function renumerar(cont, tituloSel, prefijo, esIndividuo) {
  [...cont.children].forEach((el, i) => {
    if (esIndividuo) {
      const numero = `G${i + 1}`;
      el.dataset.numero = numero;
      el.querySelector(tituloSel).textContent = `${prefijo} ${numero}`;
    } else {
      el.querySelector(tituloSel).textContent = `${prefijo} ${i + 1}`;
    }
  });
}

function agregarIndicio(form) {
  const tpl = $('tpl-indicio');
  const clone = tpl.content.firstElementChild.cloneNode(true);
  const cont = form.querySelector('[data-indicios]');
  clone._gps = null;
  clone._foto = null;
  wireSubGps(clone);
  wireSubFoto(clone, form, () => {
    const i = [...cont.children].indexOf(clone) + 1;
    return `Indicio ${i > 0 ? i : cont.children.length + 1}`;
  });
  clone.querySelector('[data-remove]').addEventListener('click', () => {
    clone.remove();
    renumerar(cont, '[data-indicio-title]', 'Indicio');
  });
  cont.appendChild(clone);
  renumerar(cont, '[data-indicio-title]', 'Indicio');
}

function agregarIndividuo(form) {
  const tpl = $('tpl-individuo');
  const clone = tpl.content.firstElementChild.cloneNode(true);
  const cont = form.querySelector('[data-individuos]');
  const selFeno = clone.querySelector('[data-fenologico]');
  selFeno.innerHTML = '<option value="">— Seleccionar —</option>';
  ESTADOS_FENOLOGICOS.forEach((v) => selFeno.appendChild(new Option(v, v)));
  const selSani = clone.querySelector('[data-sanitario]');
  selSani.innerHTML = '<option value="">— Seleccionar —</option>';
  ESTADOS_SANITARIOS.forEach((v) => selSani.appendChild(new Option(v, v)));
  clone._foto = null;
  wireSubFoto(clone, form, () => `Individuo ${clone.dataset.numero || ''}`);
  clone.querySelector('[data-remove]').addEventListener('click', () => {
    clone.remove();
    renumerar(cont, '[data-individuo-title]', 'Individuo', true);
  });
  cont.appendChild(clone);
  renumerar(cont, '[data-individuo-title]', 'Individuo', true);
}

// ---------- Recolección de datos al guardar ----------
function recolectarIndicios(form) {
  return [...form.querySelectorAll('[data-indicios] [data-indicio-item]')].map((el, i) => ({
    numero_indicio: i + 1,
    utm_este: el._gps?.x ?? null,
    utm_norte: el._gps?.y ?? null,
    huso: el._gps?.huso ?? null,
    codigo_gps_indicio: el.querySelector('[data-codigo-gps]').value.trim(),
    foto: el._foto || null,
    observaciones: el.querySelector('[data-observaciones]').value.trim(),
  }));
}

function recolectarIndividuos(form) {
  return [...form.querySelectorAll('[data-individuos] [data-individuo-item]')].map((el) => ({
    numero_individuo: el.dataset.numero,
    profundidad_cm: el.querySelector('[data-profundidad]').value ? Number(el.querySelector('[data-profundidad]').value) : null,
    estado_fenologico: el.querySelector('[data-fenologico]').value,
    estado_sanitario: el.querySelector('[data-sanitario]').value,
    foto: el._foto || null,
  }));
}

// ---------- Guardar ----------
async function guardar(e) {
  e.preventDefault();
  const form = e.target;
  const edt = form.dataset.edt;
  const cfg = FORMULARIOS[edt];
  const get = (name) => (form.querySelector(`[data-f="${name}"]`)?.value || '').trim();

  const zona = get('zona');
  const fecha = get('fecha');
  const evaluadora = get('evaluadora');
  const numero_unidad = Number(get('numero_unidad'));

  if (!zona || !fecha || !evaluadora) { toast('Completa zona, fecha y evaluadora'); return; }
  if (!numero_unidad || !Number.isInteger(numero_unidad) || numero_unidad < 1 || numero_unidad > TOTAL_UNIDADES) {
    toast(`El N° de ${cfg.unidad_singular.toLowerCase()} debe ser un entero entre 1 y ${TOTAL_UNIDADES}`);
    return;
  }
  if (!form._gpsMain) { toast('Captura el punto GPS antes de guardar'); return; }

  const usados = await DB.numerosUsados(edt);
  if (usados.has(numero_unidad)) {
    toast(`Atención: ya existe un registro para ${cfg.unidad_singular} ${numero_unidad}. Revisa que no sea un duplicado.`);
  }

  const base = {
    record_id: `${edt}-${crypto.randomUUID()}`,
    proyecto_id: PROYECTO.project_id,
    nombre_proyecto: PROYECTO.nombre_proyecto,
    codigo_edt: edt,
    zona, fecha, evaluadora, numero_unidad,
    utm_este: form._gpsMain.x,
    utm_norte: form._gpsMain.y,
    huso: form._gpsMain.huso,
    foto: form._fotoMain || null,
    observaciones: get('observaciones'),
    estado_sincronizacion: 'Pendiente',
    fecha_sincronizacion: null,
  };

  let reg;
  if (edt === '6.1') {
    const presencia_vegetacion_acompanante = get('presencia_vegetacion_acompanante');
    const presencia_curureras = get('presencia_curureras');
    if (!presencia_vegetacion_acompanante || !presencia_curureras) {
      toast('Indica presencia de vegetación acompañante y de curureras'); return;
    }
    reg = {
      ...base,
      codigo_gps_zona: get('codigo_gps_zona'),
      presencia_vegetacion_acompanante,
      presencia_curureras,
      indicios: recolectarIndicios(form),
    };
  } else if (edt === '6.2') {
    const tipo_vegetacion = get('tipo_vegetacion');
    const presencia_curureras = get('presencia_curureras');
    if (!tipo_vegetacion || !presencia_curureras) { toast('Completa tipo de vegetación y presencia de curureras'); return; }
    reg = {
      ...base,
      codigo_gps_parcela: get('codigo_gps_parcela'),
      tipo_vegetacion,
      tipo_vegetacion_otro: get('tipo_vegetacion_otro'),
      especies: get('especies'),
      presencia_curureras,
      indicios: recolectarIndicios(form),
    };
  } else {
    const presencia_geofita = get('presencia_geofita');
    if (!presencia_geofita) { toast('Indica si hay presencia de geófita'); return; }
    const individuos = recolectarIndividuos(form);
    if (presencia_geofita === 'Sí' && individuos.length === 0) {
      toast('Agrega al menos un individuo, ya que hay presencia de geófita'); return;
    }
    reg = {
      ...base,
      codigo_gps_calicata: get('codigo_gps_calicata'),
      presencia_geofita,
      individuos,
    };
  }

  await DB.addRegistro(edt, reg);
  toast(`Guardado: ${cfg.unidad_singular} ${numero_unidad}`);
  form.reset(); // dispara 'reset' -> limpiarExtras() hace el resto (GPS, fotos, indicios/individuos)
  await refrescarLista(edt);
  await actualizarStats();
}

// Limpieza de todo lo que el reset nativo del <form> no cubre: estado en memoria
// (GPS/foto principal), bloques repetibles de indicios/individuos, y la fecha por defecto.
function limpiarExtras(form) {
  form._gpsMain = null;
  form._fotoMain = null;
  const accMain = form.querySelector('[data-gps-acc]');
  if (accMain) accMain.textContent = '';
  const btnGpsMain = form.querySelector('[data-gps-main]');
  if (btnGpsMain) btnGpsMain.textContent = '📍 Capturar GPS';
  const previewMain = form.querySelector('[data-foto-preview-main]');
  if (previewMain) previewMain.classList.add('hidden');
  const indicios = form.querySelector('[data-indicios]');
  if (indicios) indicios.innerHTML = '';
  const individuos = form.querySelector('[data-individuos]');
  if (individuos) individuos.innerHTML = '';
  const otroWrap = form.querySelector('[data-otro-vegetacion-wrap]');
  if (otroWrap) otroWrap.classList.add('hidden');
  form.querySelector('[data-f="fecha"]').value = new Date().toISOString().slice(0, 10);
}

// ---------- Listas ----------
function tituloRegistro(edt, r) {
  return `${FORMULARIOS[edt].unidad_singular} ${r.numero_unidad}`;
}

function subInfo(edt, r) {
  if (edt === '6.3') return `${r.individuos?.length || 0} individuo(s)`;
  return `${r.indicios?.length || 0} indicio(s)`;
}

async function refrescarLista(edt) {
  const regs = (await DB.getRegistros(edt)).sort(
    (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.numero_unidad || 0) - (a.numero_unidad || 0)
  );
  const sec = seccionDe(edt);
  sec.querySelectorAll('[data-count]').forEach((b) => { b.textContent = regs.length; });
  const cont = sec.querySelector('[data-list]');
  cont.innerHTML = '';
  sec.querySelector('[data-empty]').style.display = regs.length ? 'none' : 'block';

  for (const r of regs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-main">
        <strong>${tituloRegistro(edt, r)}</strong> — ${r.zona}
        <span class="tag">${r.estado_sincronizacion || 'Pendiente'}</span>
        <div class="card-sub">
          ${r.fecha} · ${r.evaluadora} · ${subInfo(edt, r)}${r.foto ? ' · 📷' : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-mini danger" data-del>🗑</button>
      </div>`;
    card.querySelector('[data-del]').addEventListener('click', async () => {
      if (confirm(`¿Eliminar el registro de ${tituloRegistro(edt, r)}?`)) {
        await DB.deleteRegistro(edt, r.id);
        await refrescarLista(edt);
        await actualizarStats();
      }
    });
    cont.appendChild(card);
  }
}

async function actualizarStats() {
  const todos = await DB.getTodosLosRegistros();
  const total = EDTS.reduce((sum, edt) => sum + todos[edt].length, 0);
  $('stats').textContent = `${total} registro(s) guardados en este dispositivo.`;
}

async function refrescarTodasLasListas() {
  for (const edt of EDTS) await refrescarLista(edt);
  await actualizarStats();
}

// ---------- Catálogos base por formulario ----------
function cargarCatalogosBase() {
  document.querySelectorAll('[data-f="evaluadora"]').forEach((sel) => {
    sel.innerHTML = '<option value="" disabled selected>— Seleccionar —</option>';
    RESPONSABLES.forEach((n) => sel.appendChild(new Option(n, n)));
  });

  const selVeg = document.querySelector('[data-f="tipo_vegetacion"]');
  if (selVeg) {
    selVeg.innerHTML = '<option value="" disabled selected>— Seleccionar —</option>';
    TIPOS_VEGETACION.forEach((v) => selVeg.appendChild(new Option(v, v)));
    selVeg.addEventListener('change', () => {
      const wrap = selVeg.closest('form').querySelector('[data-otro-vegetacion-wrap]');
      wrap.classList.toggle('hidden', !selVeg.value.startsWith('Otro'));
    });
  }
}

// ---------- Navegación ----------
function setupTabs() {
  document.querySelectorAll('.tabs > .tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tabs > .tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('main > .view').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      $('view-' + t.dataset.view).classList.add('active');
    });
  });
}

function setupSubtabs() {
  document.querySelectorAll('.subtabs').forEach((nav) => {
    const sec = nav.closest('.view');
    const edt = sec.dataset.edt;
    nav.querySelectorAll('.subtab').forEach((t) => {
      t.addEventListener('click', () => {
        nav.querySelectorAll('.subtab').forEach((x) => x.classList.remove('active'));
        sec.querySelectorAll(':scope > .subview').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        sec.querySelector(`.subview[data-sub="${t.dataset.sub}"]`).classList.add('active');
        if (t.dataset.sub === 'list' && edt) refrescarLista(edt);
      });
    });
  });
}

// ---------- Estado de red ----------
function setupNetwork() {
  const upd = () => {
    const s = $('net-status');
    s.classList.toggle('online', navigator.onLine);
    s.title = navigator.onLine ? 'En línea' : 'Sin conexión (offline)';
  };
  window.addEventListener('online', upd);
  window.addEventListener('offline', upd);
  upd();
}

// ---------- Init ----------
async function init() {
  setupTabs();
  setupSubtabs();
  setupNetwork();
  cargarCatalogosBase();
  $('app-version').textContent = 'Versión ' + VERSION;

  EDTS.forEach((edt) => {
    const form = formDe(edt);
    form.querySelector('[data-f="fecha"]').value = new Date().toISOString().slice(0, 10);
    wireMainGps(form);
    wireMainFoto(form);
    form.addEventListener('submit', guardar);
    form.addEventListener('reset', () => setTimeout(() => limpiarExtras(form), 0));

    const addIndicio = form.querySelector('[data-add-indicio]');
    if (addIndicio) addIndicio.addEventListener('click', () => agregarIndicio(form));
    const addIndividuo = form.querySelector('[data-add-individuo]');
    if (addIndividuo) addIndividuo.addEventListener('click', () => agregarIndividuo(form));
  });

  $('exp-xlsx').addEventListener('click', async () => XP.exportarExcel(await DB.getTodosLosRegistros()));
  $('exp-json').addEventListener('click', async () => XP.exportarRespaldo(await DB.getTodosLosRegistros()));

  $('sync-url').value = SYNC.getUrl();
  $('sync-url').addEventListener('change', (e) => { SYNC.setUrl(e.target.value); toast('URL guardada'); });
  $('btn-sync').addEventListener('click', async () => {
    const btn = $('btn-sync');
    btn.disabled = true;
    $('sync-info').textContent = 'Sincronizando…';
    try {
      const r = await SYNC.sincronizar((n, t) => { $('sync-info').textContent = `Enviando ${n}/${t}…`; });
      $('sync-info').textContent = r.enviados
        ? `✅ ${r.enviados} registro(s) sincronizado(s).`
        : 'Todo al día, no hay pendientes.';
      toast('Sincronización completa');
      await refrescarTodasLasListas();
    } catch (err) {
      $('sync-info').textContent = '⚠️ ' + err.message;
      toast('Error al sincronizar');
    } finally {
      btn.disabled = false;
    }
  });

  await refrescarTodasLasListas();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
