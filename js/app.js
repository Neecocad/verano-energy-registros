// Lógica principal — Verano Energy: registros individuales por EDT (6.1/6.2/6.3).
// Cada formulario captura GPS + fotografía georreferenciada del punto principal,
// más una lista repetible de indicios (6.1/6.2) o individuos (6.3), cada uno con
// su propio GPS/foto cuando corresponde.
//
// Guardar vs. Marcar como listo: "Guardar borrador" nunca valida — así el dato
// capturado en terreno no se pierde aunque falte un campo, GPS o foto. "Marcar
// como listo" valida todo y, si falta algo, igual guarda como borrador y muestra
// qué falta (nunca se pierde lo ya ingresado). Solo lo marcado como listo entra
// a la cola de sincronización (ver sync.js).
import * as DB from './db.js';
import { latLonToUTM } from './utm.js';
import * as XP from './export.js';
import * as SYNC from './sync.js';
import {
  PROYECTO, RESPONSABLES_POR_EDT, OTRA_PERSONA, TOTAL_UNIDADES,
  TIPOS_VEGETACION, ESTADOS_FENOLOGICOS, ESTADOS_SANITARIOS, FORMULARIOS,
} from './catalog.js';

const VERSION = 'v2';
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
        resolve({ ...utm, accuracy, capturado_en: new Date().toISOString() });
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

// Numeración estable: cada contenedor lleva un contador que solo avanza. Si se
// elimina un ítem, su número NUNCA se reutiliza ni se reasigna a los restantes
// (ej.: si se elimina G02, el próximo individuo nuevo es G04, no G02 ni G03).
function siguienteNumero(cont, prefijo) {
  const n = Number(cont.dataset.next || '1');
  cont.dataset.next = String(n + 1);
  return prefijo ? `${prefijo}${n}` : n;
}

function asegurarSiguiente(cont, numero) {
  const n = typeof numero === 'string' ? parseInt(numero.replace(/\D/g, ''), 10) : numero;
  if (!Number.isFinite(n)) return;
  const actual = Number(cont.dataset.next || '1');
  if (n + 1 > actual) cont.dataset.next = String(n + 1);
}

function agregarIndicio(form, prefill) {
  const tpl = $('tpl-indicio');
  const clone = tpl.content.firstElementChild.cloneNode(true);
  const cont = form.querySelector('[data-indicios]');
  const numero = prefill ? prefill.numero_indicio : siguienteNumero(cont);
  if (prefill) asegurarSiguiente(cont, numero);
  clone.dataset.numero = numero;
  clone.querySelector('[data-indicio-title]').textContent = `Indicio ${numero}`;

  clone._gps = prefill && prefill.utm_este != null
    ? { x: prefill.utm_este, y: prefill.utm_norte, huso: prefill.huso, accuracy: prefill.precision_gps, capturado_en: prefill.gps_capturado_en }
    : null;
  if (clone._gps) {
    const accEl = clone.querySelector('[data-gps-acc]');
    if (accEl) accEl.textContent = `Huso ${clone._gps.huso} · capturado`;
    clone.querySelector('[data-gps]').textContent = '📍 Recapturar GPS';
  }

  clone._foto = null;
  wireSubGps(clone);
  wireSubFoto(clone, form, () => `Indicio ${clone.dataset.numero}`);

  if (prefill) {
    clone.querySelector('[data-codigo-gps]').value = prefill.codigo_gps_indicio || '';
    clone.querySelector('[data-observaciones]').value = prefill.observaciones || '';
    if (prefill.foto) {
      clone._foto = prefill.foto;
      clone.querySelector('[data-foto-img]').src = prefill.foto;
      clone.querySelector('[data-foto-preview]').classList.remove('hidden');
    }
  }

  clone.querySelector('[data-remove]').addEventListener('click', () => clone.remove());
  cont.appendChild(clone);
}

function agregarIndividuo(form, prefill) {
  const tpl = $('tpl-individuo');
  const clone = tpl.content.firstElementChild.cloneNode(true);
  const cont = form.querySelector('[data-individuos]');
  const numero = prefill ? prefill.numero_individuo : siguienteNumero(cont, 'G');
  if (prefill) asegurarSiguiente(cont, numero);
  clone.dataset.numero = numero;
  clone.querySelector('[data-individuo-title]').textContent = `Individuo ${numero}`;

  const selFeno = clone.querySelector('[data-fenologico]');
  selFeno.innerHTML = '<option value="">— Seleccionar —</option>';
  ESTADOS_FENOLOGICOS.forEach((v) => selFeno.appendChild(new Option(v, v)));
  const selSani = clone.querySelector('[data-sanitario]');
  selSani.innerHTML = '<option value="">— Seleccionar —</option>';
  ESTADOS_SANITARIOS.forEach((v) => selSani.appendChild(new Option(v, v)));

  clone._foto = null;
  wireSubFoto(clone, form, () => `Individuo ${clone.dataset.numero}`);

  if (prefill) {
    clone.querySelector('[data-profundidad]').value = prefill.profundidad_cm ?? '';
    selFeno.value = prefill.estado_fenologico || '';
    selSani.value = prefill.estado_sanitario || '';
    if (prefill.foto) {
      clone._foto = prefill.foto;
      clone.querySelector('[data-foto-img]').src = prefill.foto;
      clone.querySelector('[data-foto-preview]').classList.remove('hidden');
    }
  }

  clone.querySelector('[data-remove]').addEventListener('click', () => clone.remove());
  cont.appendChild(clone);
}

// ---------- Recolección de datos al guardar ----------
function recolectarIndicios(form) {
  return [...form.querySelectorAll('[data-indicios] [data-indicio-item]')].map((el) => ({
    numero_indicio: Number(el.dataset.numero),
    utm_este: el._gps?.x ?? null,
    utm_norte: el._gps?.y ?? null,
    huso: el._gps?.huso ?? null,
    precision_gps: el._gps?.accuracy ?? null,
    gps_capturado_en: el._gps?.capturado_en ?? null,
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

// ---------- Validación completa (solo para "Marcar como listo") ----------
function faltantesComunes(get, form) {
  const faltan = [];
  if (!get('zona')) faltan.push('Zona');
  if (!get('fecha')) faltan.push('Fecha');
  const evaluadora = get('evaluadora');
  if (!evaluadora) faltan.push('Persona evaluadora');
  else if (evaluadora === OTRA_PERSONA && !get('evaluadora_otra')) faltan.push('Nombre de la persona evaluadora ("Otra")');
  const numeroTxt = get('numero_unidad');
  const numero = Number(numeroTxt);
  if (!numeroTxt || !Number.isInteger(numero) || numero < 1 || numero > TOTAL_UNIDADES) {
    faltan.push(`N° de unidad (entero entre 1 y ${TOTAL_UNIDADES})`);
  }
  if (!form._gpsMain) faltan.push('Punto GPS');
  return faltan;
}

function faltantesEspecificos(edt, get, form) {
  const faltan = [];
  if (edt === '6.1') {
    if (!get('presencia_vegetacion_acompanante')) faltan.push('Vegetación acompañante');
    if (!get('presencia_curureras')) faltan.push('Presencia de curureras');
  } else if (edt === '6.2') {
    if (!get('tipo_vegetacion')) faltan.push('Tipo de vegetación');
    if (get('tipo_vegetacion').startsWith('Otro') && !get('tipo_vegetacion_otro')) faltan.push('Especificar tipo de vegetación "Otro"');
    if (!get('presencia_curureras')) faltan.push('Presencia de curureras');
  } else {
    const presencia = get('presencia_geofita');
    if (!presencia) faltan.push('Presencia de geófita');
    else if (presencia === 'Sí' && recolectarIndividuos(form).length === 0) faltan.push('Al menos un individuo (hay presencia de geófita)');
  }
  return faltan;
}

// ---------- Guardar (borrador o marcar como listo) ----------
async function guardarRegistro(form, { marcarListo }) {
  const edt = form.dataset.edt;
  const cfg = FORMULARIOS[edt];
  const get = (name) => (form.querySelector(`[data-f="${name}"]`)?.value || '').trim();

  const faltantes = marcarListo ? [...faltantesComunes(get, form), ...faltantesEspecificos(edt, get, form)] : [];
  const completo = faltantes.length === 0;

  const evaluadora = get('evaluadora');
  const evaluadora_otra = evaluadora === OTRA_PERSONA ? get('evaluadora_otra') : '';
  const persona_evaluadora_final = evaluadora === OTRA_PERSONA ? evaluadora_otra : evaluadora;
  const numero_unidad = get('numero_unidad') ? Number(get('numero_unidad')) : null;

  const todosEdt = await DB.getRegistros(edt);
  const original = form._editId ? todosEdt.find((r) => r.id === form._editId) : null;
  const duplicado = numero_unidad != null && todosEdt.some((r) => r.numero_unidad === numero_unidad && r.id !== form._editId);

  const base = {
    record_id: form._recordId || `${edt}-${crypto.randomUUID()}`,
    proyecto_id: PROYECTO.project_id,
    nombre_proyecto: PROYECTO.nombre_proyecto,
    codigo_edt: edt,
    zona: get('zona'),
    fecha: get('fecha'),
    evaluadora: persona_evaluadora_final,
    persona_evaluadora: evaluadora,
    persona_evaluadora_otra: evaluadora_otra,
    persona_evaluadora_final,
    numero_unidad,
    utm_este: form._gpsMain?.x ?? null,
    utm_norte: form._gpsMain?.y ?? null,
    huso: form._gpsMain?.huso ?? null,
    precision_gps: form._gpsMain?.accuracy ?? null,
    gps_capturado_en: form._gpsMain?.capturado_en ?? null,
    foto: form._fotoMain || null,
    observaciones: get('observaciones'),
    estado_sync: completo && marcarListo ? 'PENDIENTE' : 'BORRADOR',
    estado_sincronizacion: completo && marcarListo ? 'Pendiente' : 'Borrador',
    sincronizado: 0,
    fecha_sincronizacion: null,
  };
  if (original) base.fecha_creacion = original.fecha_creacion;

  let reg;
  if (edt === '6.1') {
    reg = {
      ...base,
      codigo_gps_zona: get('codigo_gps_zona'),
      presencia_vegetacion_acompanante: get('presencia_vegetacion_acompanante'),
      presencia_curureras: get('presencia_curureras'),
      indicios: recolectarIndicios(form),
    };
  } else if (edt === '6.2') {
    reg = {
      ...base,
      codigo_gps_parcela: get('codigo_gps_parcela'),
      tipo_vegetacion: get('tipo_vegetacion'),
      tipo_vegetacion_otro: get('tipo_vegetacion_otro'),
      especies: get('especies'),
      presencia_curureras: get('presencia_curureras'),
      indicios: recolectarIndicios(form),
    };
  } else {
    reg = {
      ...base,
      codigo_gps_calicata: get('codigo_gps_calicata'),
      presencia_geofita: get('presencia_geofita'),
      individuos: recolectarIndividuos(form),
    };
  }

  if (form._editId) {
    reg.id = form._editId;
    await DB.updateRegistro(edt, reg);
  } else {
    await DB.addRegistro(edt, reg);
  }

  const faltantesMsg = (marcarListo && !completo) ? `Guardado como borrador — falta: ${faltantes.join(', ')}.` : null;
  const numeroTxt = numero_unidad ?? '';

  form.reset(); // dispara 'reset' -> limpiarExtras() hace el resto (GPS, fotos, indicios/individuos)
  setTimeout(() => {
    const faltantesEl = form.querySelector('[data-faltantes]');
    if (faltantesEl && faltantesMsg) {
      faltantesEl.textContent = faltantesMsg;
      faltantesEl.classList.remove('hidden');
    }
  }, 0);

  if (faltantesMsg) toast('Faltan datos: guardado como borrador');
  else if (duplicado) toast(`Atención: ya existe un registro para ${cfg.unidad_singular} ${numeroTxt}. Revisa que no sea un duplicado.`);
  else toast(marcarListo ? `Listo para sincronizar: ${cfg.unidad_singular} ${numeroTxt}` : `Borrador guardado: ${cfg.unidad_singular} ${numeroTxt}`);

  await refrescarLista(edt);
  await actualizarStats();
}

// Limpieza de todo lo que el reset nativo del <form> no cubre: estado en memoria
// (GPS/foto principal), bloques repetibles de indicios/individuos, contexto de
// edición de borrador, y la fecha por defecto.
function limpiarExtras(form) {
  form._gpsMain = null;
  form._fotoMain = null;
  form._editId = null;
  form._recordId = null;
  const accMain = form.querySelector('[data-gps-acc]');
  if (accMain) accMain.textContent = '';
  const btnGpsMain = form.querySelector('[data-gps-main]');
  if (btnGpsMain) btnGpsMain.textContent = '📍 Capturar GPS';
  const previewMain = form.querySelector('[data-foto-preview-main]');
  if (previewMain) previewMain.classList.add('hidden');
  const indicios = form.querySelector('[data-indicios]');
  if (indicios) { indicios.innerHTML = ''; delete indicios.dataset.next; }
  const individuos = form.querySelector('[data-individuos]');
  if (individuos) { individuos.innerHTML = ''; delete individuos.dataset.next; }
  const otroWrap = form.querySelector('[data-otro-vegetacion-wrap]');
  if (otroWrap) otroWrap.classList.add('hidden');
  const otraEvalWrap = form.querySelector('[data-otra-evaluadora-wrap]');
  if (otraEvalWrap) otraEvalWrap.classList.add('hidden');
  const faltantesEl = form.querySelector('[data-faltantes]');
  if (faltantesEl) faltantesEl.classList.add('hidden');
  form.querySelector('[data-f="fecha"]').value = new Date().toISOString().slice(0, 10);
}

// ---------- Continuar un borrador (recarga sus datos en el formulario) ----------
function cargarEnFormulario(edt, reg) {
  const form = formDe(edt);
  form.reset();
  setTimeout(() => {
    form._editId = reg.id;
    form._recordId = reg.record_id;

    const set = (name, value) => {
      const el = form.querySelector(`[data-f="${name}"]`);
      if (el) el.value = value ?? '';
    };
    set('zona', reg.zona);
    set('fecha', reg.fecha);
    set('numero_unidad', reg.numero_unidad);
    set('observaciones', reg.observaciones);

    const selEval = form.querySelector('[data-f="evaluadora"]');
    selEval.value = reg.persona_evaluadora || reg.evaluadora || '';
    if (selEval.value === OTRA_PERSONA) {
      const wrap = form.querySelector('[data-otra-evaluadora-wrap]');
      wrap.classList.remove('hidden');
      set('evaluadora_otra', reg.persona_evaluadora_otra);
    }

    if (edt === '6.1') {
      set('codigo_gps_zona', reg.codigo_gps_zona);
      set('presencia_vegetacion_acompanante', reg.presencia_vegetacion_acompanante);
      set('presencia_curureras', reg.presencia_curureras);
    } else if (edt === '6.2') {
      set('codigo_gps_parcela', reg.codigo_gps_parcela);
      set('tipo_vegetacion', reg.tipo_vegetacion);
      if ((reg.tipo_vegetacion || '').startsWith('Otro')) {
        form.querySelector('[data-otro-vegetacion-wrap]').classList.remove('hidden');
        set('tipo_vegetacion_otro', reg.tipo_vegetacion_otro);
      }
      set('especies', reg.especies);
      set('presencia_curureras', reg.presencia_curureras);
    } else {
      set('codigo_gps_calicata', reg.codigo_gps_calicata);
      set('presencia_geofita', reg.presencia_geofita);
    }

    if (reg.utm_este != null && reg.utm_norte != null) {
      form._gpsMain = { x: reg.utm_este, y: reg.utm_norte, huso: reg.huso, accuracy: reg.precision_gps, capturado_en: reg.gps_capturado_en };
      form.querySelector('[data-f="utm_este"]').value = reg.utm_este;
      form.querySelector('[data-f="utm_norte"]').value = reg.utm_norte;
      const accEl = form.querySelector('[data-gps-acc]');
      if (accEl) accEl.textContent = reg.precision_gps != null ? `Huso ${reg.huso} · ±${Math.round(reg.precision_gps)} m` : `Huso ${reg.huso} · capturado`;
      const btnGps = form.querySelector('[data-gps-main]');
      if (btnGps) btnGps.textContent = '📍 Recapturar GPS';
    }

    if (reg.foto) {
      form._fotoMain = reg.foto;
      form.querySelector('[data-foto-img-main]').src = reg.foto;
      form.querySelector('[data-foto-preview-main]').classList.remove('hidden');
    }

    if (edt === '6.3') (reg.individuos || []).forEach((ind) => agregarIndividuo(form, ind));
    else (reg.indicios || []).forEach((ind) => agregarIndicio(form, ind));

    // Ir al sub-tab "Nuevo" de este EDT.
    const sec = seccionDe(edt);
    sec.querySelectorAll('.subtab').forEach((t) => t.classList.toggle('active', t.dataset.sub === 'form'));
    sec.querySelectorAll(':scope > .subview').forEach((v) => v.classList.toggle('active', v.dataset.sub === 'form'));
    document.querySelectorAll('.tabs > .tab').forEach((t) => t.classList.toggle('active', t.dataset.view === 'edt' + edt.replace('.', '')));
    document.querySelectorAll('main > .view').forEach((v) => v.classList.toggle('active', v === sec));
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`Editando borrador: ${tituloRegistro(edt, reg)}`);
  }, 0);
}

// ---------- Listas ----------
function tituloRegistro(edt, r) {
  return `${FORMULARIOS[edt].unidad_singular} ${r.numero_unidad ?? '(sin número)'}`;
}

function subInfo(edt, r) {
  if (edt === '6.3') return `${r.individuos?.length || 0} individuo(s)`;
  return `${r.indicios?.length || 0} indicio(s)`;
}

function etiquetaEstado(r) {
  if (r.estado_sync === 'BORRADOR') return 'Borrador';
  return r.estado_sincronizacion || 'Pendiente';
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
    const esBorrador = r.estado_sync === 'BORRADOR';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-main">
        <strong>${tituloRegistro(edt, r)}</strong> — ${r.zona || '(sin zona)'}
        <span class="tag">${etiquetaEstado(r)}</span>
        <div class="card-sub">
          ${r.fecha || '(sin fecha)'} · ${r.persona_evaluadora_final || r.evaluadora || '(sin evaluadora)'} · ${subInfo(edt, r)}${r.foto ? ' · 📷' : ''}
        </div>
      </div>
      <div class="card-actions">
        ${esBorrador ? '<button type="button" class="btn-mini" data-continuar>✏️</button>' : ''}
        <button type="button" class="btn-mini danger" data-del>🗑</button>
      </div>`;
    if (esBorrador) {
      card.querySelector('[data-continuar]').addEventListener('click', () => cargarEnFormulario(edt, r));
    }
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
  document.querySelectorAll('.reg-form').forEach((form) => {
    const edt = form.dataset.edt;
    const sel = form.querySelector('[data-f="evaluadora"]');
    if (sel) {
      sel.innerHTML = '<option value="" disabled selected>— Seleccionar —</option>';
      (RESPONSABLES_POR_EDT[edt] || []).forEach((n) => sel.appendChild(new Option(n, n)));
      sel.addEventListener('change', () => {
        const wrap = form.querySelector('[data-otra-evaluadora-wrap]');
        const esOtra = sel.value === OTRA_PERSONA;
        wrap.classList.toggle('hidden', !esOtra);
        if (!esOtra) form.querySelector('[data-f="evaluadora_otra"]').value = '';
      });
    }
  });

  const selVeg = document.querySelector('[data-f="tipo_vegetacion"]');
  if (selVeg) {
    selVeg.innerHTML = '<option value="" disabled selected>— Seleccionar —</option>';
    TIPOS_VEGETACION.forEach((v) => selVeg.appendChild(new Option(v, v)));
    selVeg.addEventListener('change', () => {
      const form = selVeg.closest('form');
      const wrap = form.querySelector('[data-otro-vegetacion-wrap]');
      const esOtro = selVeg.value.startsWith('Otro');
      wrap.classList.toggle('hidden', !esOtro);
      if (!esOtro) form.querySelector('[data-f="tipo_vegetacion_otro"]').value = '';
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
    form.addEventListener('submit', (e) => { e.preventDefault(); guardarRegistro(form, { marcarListo: true }); });
    const btnBorrador = form.querySelector('[data-guardar-borrador]');
    if (btnBorrador) btnBorrador.addEventListener('click', () => guardarRegistro(form, { marcarListo: false }));
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
        : 'Todo al día, no hay pendientes (los borradores no se sincronizan).';
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
