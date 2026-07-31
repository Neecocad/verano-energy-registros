// Lógica principal — Verano Energy: registros individuales por EDT (6.1/6.2/6.3).
// Cada formulario captura GPS + fotografía georreferenciada del punto principal,
// más una lista repetible de indicios (6.1/6.2) o individuos (6.3), cada uno con
// su propio GPS/foto cuando corresponde.
import * as DB from './db.js';
import { latLonToUTM } from './utm.js';
import * as XP from './export.js';
import * as SYNC from './sync.js';
import {
  PROYECTO, RESPONSABLES, OPCION_OTRO, TOTAL_UNIDADES,
  TIPOS_VEGETACION, TIPOS_INDICIO, ESTADOS_FENOLOGICOS, ESTADOS_SANITARIOS, FORMULARIOS,
} from './catalog.js';
import {
  nuevoUUID, codigoParcela, codigoElemento, etiquetaElemento,
  TIPO_FILA_ESPECIE, TIPO_FILA_INDICIO,
} from './codigos.js';

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
// El sello se estampa sobre la imagen (Canvas) antes de guardarla, así que viaja
// con la foto a Drive y no depende de metadatos EXIF que cualquier app puede
// borrar. Es idéntico en los 3 formularios y en cada indicio/especie/individuo.
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

        // Tamaño de fuente proporcional a la foto, reducido hasta que la línea
        // más larga (habitualmente la de UTM) quepa completa a lo ancho.
        let fs = Math.max(14, Math.round(h * 0.028));
        const anchoMax = (tam) => {
          ctx.font = `bold ${tam}px sans-serif`;
          return Math.max(...lineas.map((ln) => ctx.measureText(ln).width));
        };
        while (fs > 10 && anchoMax(fs) > w - fs) fs -= 1;
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

// Nombre efectivo de quien evalúa: el del catálogo, o el texto libre si se
// eligió "Otro (especificar)".
function evaluadoraEfectiva(form) {
  const sel = form.querySelector('[data-f="evaluadora"]');
  if (!sel) return '';
  if (sel.value === OPCION_OTRO) {
    return (form.querySelector('[data-f="evaluadora_otro"]')?.value || '').trim();
  }
  return sel.value;
}

// Contenido del geo-sello. Siempre incluye proyecto y coordenadas UTM; el resto
// (EDT, unidad, código de parcela, zona, elemento, persona evaluadora, fecha y
// hora) sirve para identificar la foto sin abrir la planilla.
function buildLineas(form, utm, etiqueta, opts = {}) {
  const edt = form.dataset.edt;
  const cfg = FORMULARIOS[edt];
  const numero = form.querySelector('[data-f="numero_unidad"]').value;
  const zona = form.querySelector('[data-f="zona"]').value;

  const lineas = [`Proyecto: ${PROYECTO.nombre_proyecto}`];

  let unidad = `EDT ${cfg.codigo_edt} · ${cfg.unidad_singular} ${numero || '—'}`;
  const cod = edt === '6.2' ? (form._codigoParcela || codigoParcela(zona, numero)) : null;
  if (cod) unidad += ` · ${cod}`;
  lineas.push(unidad);

  if (zona) lineas.push(`Zona: ${zona}`);
  if (etiqueta) lineas.push(etiqueta);

  const evaluadora = evaluadoraEfectiva(form);
  if (evaluadora) lineas.push(`Persona evaluadora: ${evaluadora}`);

  lineas.push(new Date().toLocaleString('es-CL'));

  if (utm) {
    const origen = opts.utmHeredada ? ` (punto de ${cfg.unidad_singular.toLowerCase()})` : '';
    lineas.push(`UTM ${utm.huso}: ${utm.x} E · ${utm.y} N${origen}`);
  } else {
    lineas.push('UTM: sin captura GPS');
  }
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
  btn.addEventListener('click', () => {
    if (!form._gpsMain) toast('Captura el GPS antes de la foto para que quede geo-sellada');
    input.click();
  });
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

// Si el bloque no tiene punto propio (especies, individuos de calicata), la foto
// se sella con el punto principal de la unidad, marcado como heredado — nunca
// queda una foto sin coordenadas cuando hay GPS disponible.
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
    const propio = clone._gps || null;
    const utm = propio || form._gpsMain || null;
    const lineas = buildLineas(form, utm, etiqueta(), { utmHeredada: !propio && !!utm });
    const dataUrl = await tomarFoto(file, lineas);
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

// ---------- Correlativos ----------
// Un contador por formulario y por tipo, que SOLO se incrementa al crear. No hay
// renumeración: si se elimina un elemento, su correlativo se pierde y el
// siguiente sigue desde el último asignado (E01, E02, E03 → se borra E02 → el
// próximo es E04).
function siguienteNumero(form, clave) {
  form._contadores[clave] += 1;
  return form._contadores[clave];
}

function agregarIndicio(form) {
  const tpl = $('tpl-indicio');
  const clone = tpl.content.firstElementChild.cloneNode(true);
  const cont = form.querySelector('[data-indicios]');
  const numero = siguienteNumero(form, 'indicio');
  clone.dataset.numero = numero;
  clone._gps = null;
  clone._foto = null;
  clone.querySelector('[data-indicio-title]').textContent = `Indicio ${numero}`;
  wireSubGps(clone);
  wireSubFoto(clone, form, () => `Indicio ${numero}`);
  clone.querySelector('[data-remove]').addEventListener('click', () => clone.remove());
  cont.appendChild(clone);
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
  const numero = `G${siguienteNumero(form, 'individuo')}`;
  clone.dataset.numero = numero;
  clone._foto = null;
  clone.querySelector('[data-individuo-title]').textContent = `Individuo ${numero}`;
  wireSubFoto(clone, form, () => `Individuo ${numero}`);
  clone.querySelector('[data-remove]').addEventListener('click', () => clone.remove());
  cont.appendChild(clone);
}

// ---------- 6.2 · Elementos encontrados (especies e indicios) ----------
function codigoParcelaVigente(form) {
  return codigoParcela(
    form.querySelector('[data-f="zona"]').value,
    form.querySelector('[data-f="numero_unidad"]').value
  );
}

// Muestra el código de la parcela. Mientras no exista ningún elemento el código
// sigue en vivo a lo que se escriba; en cuanto se crea el primer elemento queda
// congelado (los códigos ya asignados lo llevan como prefijo) y solo se avisa si
// zona/N° dejan de coincidir.
function refrescarCodigoParcela(form) {
  const campo = form.querySelector('[data-codigo-parcela]');
  const aviso = form.querySelector('[data-codigo-parcela-warn]');
  if (!campo) return;
  const vigente = codigoParcelaVigente(form);

  if (!form._codigoParcela) {
    campo.value = vigente || '';
    aviso.classList.add('hidden');
    return;
  }

  campo.value = form._codigoParcela;
  if (vigente && vigente !== form._codigoParcela) {
    aviso.textContent = `Ya hay elementos creados con el código ${form._codigoParcela}, así que la parcela conserva ese código. `
      + `Si ${vigente} es el correcto, elimina los elementos, corrige los datos y vuelve a agregarlos.`;
    aviso.classList.remove('hidden');
  } else {
    aviso.classList.add('hidden');
  }
}

function refrescarResumenElementos(form) {
  const res = form.querySelector('[data-elementos-resumen]');
  if (!res) return;
  const items = [...form.querySelectorAll('[data-elementos] [data-elemento-item]')];
  const especies = items.filter((el) => el.dataset.tipoFila === TIPO_FILA_ESPECIE).length;
  const indicios = items.length - especies;
  res.textContent = items.length
    ? `${especies} especie(s) y ${indicios} indicio(s) · generarán ${items.length} fila(s) en la planilla.`
    : 'Sin elementos registrados.';
}

// `tipoFila` lo decide el botón que se presionó, nunca la persona usuaria: no
// hay ningún control editable de tipo_fila en el formulario.
function agregarElemento(form, tipoFila) {
  const cod = form._codigoParcela || codigoParcelaVigente(form);
  if (!cod) {
    toast('Ingresa la zona y el N° de parcela antes de agregar elementos');
    return;
  }
  form._codigoParcela = cod; // congelado desde el primer elemento

  const esEspecie = tipoFila === TIPO_FILA_ESPECIE;
  const tpl = $(esEspecie ? 'tpl-especie' : 'tpl-indicio-parcela');
  const clone = tpl.content.firstElementChild.cloneNode(true);
  const cont = form.querySelector('[data-elementos]');

  const numero = siguienteNumero(form, esEspecie ? 'especie' : 'indicioParcela');
  const codigo = codigoElemento(cod, tipoFila, numero);

  // Identidad del elemento: se fija ahora y ya no se recalcula nunca más.
  clone._elementoId = nuevoUUID();
  clone._numeroElemento = numero;
  clone._codigoElemento = codigo;
  clone._gps = null;
  clone._foto = null;

  const etiqueta = etiquetaElemento(tipoFila, codigo, numero);
  clone.querySelector('[data-elemento-title]').textContent = etiqueta;
  wireSubFoto(clone, form, () => etiqueta);

  if (!esEspecie) {
    wireSubGps(clone);
    const sel = clone.querySelector('[data-tipo-indicio]');
    sel.innerHTML = '<option value="">— Seleccionar —</option>';
    TIPOS_INDICIO.forEach((v) => sel.appendChild(new Option(v, v)));
    const wrap = clone.querySelector('[data-tipo-indicio-otro-wrap]');
    sel.addEventListener('change', () => wrap.classList.toggle('hidden', sel.value !== OPCION_OTRO));
  }

  clone.querySelector('[data-remove]').addEventListener('click', () => {
    // Solo se quita el bloque: el contador no retrocede, así el correlativo
    // eliminado no se reutiliza y los demás códigos no se tocan.
    clone.remove();
    refrescarResumenElementos(form);
  });

  cont.appendChild(clone);
  refrescarCodigoParcela(form);
  refrescarResumenElementos(form);
}

// ---------- Recolección de datos al guardar ----------
// Los números se LEEN del bloque (asignados al crearlo); nunca se derivan del
// índice del array, que cambiaría al eliminar u ordenar.
function recolectarIndicios(form) {
  return [...form.querySelectorAll('[data-indicios] [data-indicio-item]')].map((el) => ({
    numero_indicio: Number(el.dataset.numero),
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

// 6.2 · Devuelve dos arrays separados (especies / indicios), nunca combinados:
// cada elemento produce después su propia fila en la planilla.
function recolectarElementos(form) {
  const especies = [];
  const indicios = [];
  const codigo_parcela = form._codigoParcela || codigoParcelaVigente(form) || '';

  for (const el of form.querySelectorAll('[data-elementos] [data-elemento-item]')) {
    const tipo_fila = el.dataset.tipoFila;
    const base = {
      elemento_id: el._elementoId,
      tipo_fila,
      numero_elemento: el._numeroElemento,
      codigo_elemento: el._codigoElemento,
      codigo_parcela,
    };

    if (tipo_fila === TIPO_FILA_ESPECIE) {
      const cobertura = el.querySelector('[data-cobertura]').value;
      especies.push({
        ...base,
        nombre_especie: el.querySelector('[data-nombre-especie]').value.trim(),
        cobertura_porcentaje: cobertura === '' ? null : Number(cobertura),
        foto: el._foto || null,
        observaciones_especie: el.querySelector('[data-observaciones]').value.trim(),
      });
    } else {
      indicios.push({
        ...base,
        tipo_indicio: el.querySelector('[data-tipo-indicio]').value,
        tipo_indicio_otro: el.querySelector('[data-tipo-indicio-otro]').value.trim(),
        utm_este: el._gps?.x ?? null,
        utm_norte: el._gps?.y ?? null,
        huso: el._gps?.huso ?? null,
        codigo_gps_indicio: el.querySelector('[data-codigo-gps]').value.trim(),
        foto: el._foto || null,
        observaciones_indicio: el.querySelector('[data-observaciones]').value.trim(),
      });
    }
  }
  return { especies, indicios };
}

function validarElementos({ especies, indicios }) {
  for (const e of especies) {
    if (!e.nombre_especie) return `Falta el nombre de la especie ${e.codigo_elemento}`;
    if (e.cobertura_porcentaje !== null && (e.cobertura_porcentaje < 0 || e.cobertura_porcentaje > 100)) {
      return `La cobertura de ${e.codigo_elemento} debe estar entre 0 y 100`;
    }
  }
  for (const i of indicios) {
    if (!i.tipo_indicio) return `Falta el tipo del indicio ${i.codigo_elemento}`;
    if (i.tipo_indicio === OPCION_OTRO && !i.tipo_indicio_otro) {
      return `Especifica el tipo del indicio ${i.codigo_elemento}`;
    }
  }
  return null;
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
  const evaluadora = evaluadoraEfectiva(form);
  const numero_unidad = Number(get('numero_unidad'));

  if (!zona || !fecha) { toast('Completa la zona y la fecha'); return; }
  if (!evaluadora) {
    toast(get('evaluadora') === OPCION_OTRO
      ? 'Escribe las iniciales o el nombre de la persona evaluadora'
      : 'Selecciona la persona evaluadora');
    return;
  }
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
    evaluadora_otro: get('evaluadora_otro'),
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

    const codigo_parcela = form._codigoParcela || codigoParcelaVigente(form);
    if (!codigo_parcela) { toast('No se pudo generar el código de la parcela: revisa la zona y el N° de parcela'); return; }

    const { especies, indicios } = recolectarElementos(form);
    const error = validarElementos({ especies, indicios });
    if (error) { toast(error); return; }

    reg = {
      ...base,
      parcela_id: form._parcelaId,
      codigo_parcela,
      codigo_gps_parcela: get('codigo_gps_parcela'),
      tipo_vegetacion,
      tipo_vegetacion_otro: get('tipo_vegetacion_otro'),
      presencia_curureras,
      // Contadores persistidos: dejan constancia del último correlativo entregado
      // por tipo, incluso si esos elementos ya fueron eliminados.
      ultimo_numero_especie: form._contadores.especie,
      ultimo_numero_indicio: form._contadores.indicioParcela,
      especies,
      indicios,
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
// (GPS/foto principal), bloques repetibles, identificadores y contadores.
// Ojo: los contadores se reinician SOLO aquí, porque un formulario limpio es una
// unidad nueva (otra parcela, otro parcela_id). Dentro de un mismo registro los
// correlativos jamás retroceden.
function limpiarExtras(form) {
  form._gpsMain = null;
  form._fotoMain = null;
  form._parcelaId = nuevoUUID();
  form._codigoParcela = null;
  form._contadores = { indicio: 0, individuo: 0, especie: 0, indicioParcela: 0 };
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
  const elementos = form.querySelector('[data-elementos]');
  if (elementos) elementos.innerHTML = '';
  form.querySelectorAll('[data-otro-vegetacion-wrap], [data-otro-evaluadora-wrap]')
    .forEach((w) => w.classList.add('hidden'));
  form.querySelector('[data-f="fecha"]').value = new Date().toISOString().slice(0, 10);
  refrescarCodigoParcela(form);
  refrescarResumenElementos(form);
}

// ---------- Listas ----------
function tituloRegistro(edt, r) {
  const base = `${FORMULARIOS[edt].unidad_singular} ${r.numero_unidad}`;
  return r.codigo_parcela ? `${base} · ${r.codigo_parcela}` : base;
}

function subInfo(edt, r) {
  if (edt === '6.3') return `${r.individuos?.length || 0} individuo(s)`;
  if (edt === '6.2') {
    // `especies` era texto libre en la versión anterior; solo se cuenta si ya es
    // la lista de elementos.
    const especies = Array.isArray(r.especies) ? r.especies.length : 0;
    return `${especies} especie(s) · ${r.indicios?.length || 0} indicio(s)`;
  }
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
  // Persona evaluadora: catálogo (Juan Araya al final) + "Otro (especificar)"
  // para escribir iniciales o un nombre que no esté en la lista.
  document.querySelectorAll('[data-f="evaluadora"]').forEach((sel) => {
    sel.innerHTML = '<option value="" disabled selected>— Seleccionar —</option>';
    RESPONSABLES.forEach((n) => sel.appendChild(new Option(n, n)));
    sel.appendChild(new Option(OPCION_OTRO, OPCION_OTRO));
    const wrap = sel.closest('form').querySelector('[data-otro-evaluadora-wrap]');
    sel.addEventListener('change', () => {
      wrap.classList.toggle('hidden', sel.value !== OPCION_OTRO);
      if (sel.value === OPCION_OTRO) wrap.querySelector('input').focus();
    });
  });

  const selVeg = document.querySelector('[data-f="tipo_vegetacion"]');
  if (selVeg) {
    selVeg.innerHTML = '<option value="" disabled selected>— Seleccionar —</option>';
    TIPOS_VEGETACION.forEach((v) => selVeg.appendChild(new Option(v, v)));
    selVeg.addEventListener('change', () => {
      const wrap = selVeg.closest('form').querySelector('[data-otro-vegetacion-wrap]');
      wrap.classList.toggle('hidden', selVeg.value !== OPCION_OTRO);
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
    form._parcelaId = nuevoUUID();
    form._codigoParcela = null;
    form._contadores = { indicio: 0, individuo: 0, especie: 0, indicioParcela: 0 };
    form.querySelector('[data-f="fecha"]').value = new Date().toISOString().slice(0, 10);
    wireMainGps(form);
    wireMainFoto(form);
    form.addEventListener('submit', guardar);
    form.addEventListener('reset', () => setTimeout(() => limpiarExtras(form), 0));

    const addIndicio = form.querySelector('[data-add-indicio]');
    if (addIndicio) addIndicio.addEventListener('click', () => agregarIndicio(form));
    const addIndividuo = form.querySelector('[data-add-individuo]');
    if (addIndividuo) addIndividuo.addEventListener('click', () => agregarIndividuo(form));

    // 6.2 · elementos encontrados: el botón fija el tipo_fila.
    const addEspecie = form.querySelector('[data-add-especie]');
    if (addEspecie) addEspecie.addEventListener('click', () => agregarElemento(form, TIPO_FILA_ESPECIE));
    const addIndicioParcela = form.querySelector('[data-add-indicio-parcela]');
    if (addIndicioParcela) addIndicioParcela.addEventListener('click', () => agregarElemento(form, TIPO_FILA_INDICIO));

    if (form.querySelector('[data-codigo-parcela]')) {
      form.querySelectorAll('[data-f="zona"], [data-f="numero_unidad"]')
        .forEach((i) => i.addEventListener('input', () => refrescarCodigoParcela(form)));
      refrescarCodigoParcela(form);
      refrescarResumenElementos(form);
    }
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
