// Almacenamiento offline con IndexedDB — registros individuales por EDT.
// Object stores:
//   registros_61 -> un registro por Transecto (con lista embebida de indicios)
//   registros_62 -> un registro por Parcela   (con lista embebida de indicios)
//   registros_63 -> un registro por Calicata  (con lista embebida de individuos)
// Cada registro guarda sus fotos en base64 hasta que se sincroniza.

const DB_NAME = 'verano-energy-registros';
const DB_VERSION = 1;
const STORES = ['registros_61', 'registros_62', 'registros_63'];

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach((nombre) => {
        if (!db.objectStoreNames.contains(nombre)) {
          const s = db.createObjectStore(nombre, { keyPath: 'id', autoIncrement: true });
          s.createIndex('sincronizado', 'sincronizado', { unique: false });
          s.createIndex('record_id', 'record_id', { unique: true });
        }
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const result = fn(s);
        t.oncomplete = () => resolve(result._value !== undefined ? result._value : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function storeDe(codigoEdt) {
  const map = { '6.1': 'registros_61', '6.2': 'registros_62', '6.3': 'registros_63' };
  const s = map[codigoEdt];
  if (!s) throw new Error('Código EDT desconocido: ' + codigoEdt);
  return s;
}

export async function addRegistro(codigoEdt, reg) {
  const now = new Date().toISOString();
  reg.fecha_creacion = now;
  reg.fecha_ultima_modificacion = now;
  reg.sincronizado = 0;
  return tx(storeDe(codigoEdt), 'readwrite', (s) => {
    const wrap = {};
    const r = s.add(reg);
    r.onsuccess = () => { wrap._value = r.result; };
    return wrap;
  });
}

export async function updateRegistro(codigoEdt, reg) {
  reg.fecha_ultima_modificacion = new Date().toISOString();
  return tx(storeDe(codigoEdt), 'readwrite', (s) => s.put(reg));
}

export async function deleteRegistro(codigoEdt, id) {
  return tx(storeDe(codigoEdt), 'readwrite', (s) => s.delete(id));
}

export async function getRegistros(codigoEdt) {
  return tx(storeDe(codigoEdt), 'readonly', (s) => {
    const wrap = { _value: [] };
    const r = s.getAll();
    r.onsuccess = () => { wrap._value = r.result || []; };
    return wrap;
  });
}

export async function getTodosLosRegistros() {
  const [r61, r62, r63] = await Promise.all([
    getRegistros('6.1'), getRegistros('6.2'), getRegistros('6.3'),
  ]);
  return { '6.1': r61, '6.2': r62, '6.3': r63 };
}

// Números de unidad (transecto/parcela/calicata) ya usados, para no repetir por error.
export async function numerosUsados(codigoEdt) {
  const regs = await getRegistros(codigoEdt);
  return new Set(regs.map((r) => r.numero_unidad));
}
