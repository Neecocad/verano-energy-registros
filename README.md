# 🌿 Verano Energy — Registros de terreno (PWA)

Formulario web instalable y **100 % offline** para el registro individual de cada
unidad de terreno del proyecto **Verano Energy**: un registro por **transecto**
(EDT 6.1), por **parcela** (EDT 6.2) y por **calicata** (EDT 6.3), cada uno con su
propio **punto GPS** y **fotografía georreferenciada**.

Es el complemento del formulario de **avance agregado**
([Control_VeranoEnergy](https://github.com/Neecocad/Control_VeranoEnergy)): aquel
registra cuánto se avanzó cada día (sin foto ni GPS), este registra **el detalle de
cada unidad** levantada en terreno. Ambas apps sincronizan a la **misma planilla**
de Google Sheets, en hojas separadas.

## Qué registra cada formulario

| EDT | Formulario | Unidad | Punto GPS + foto principal | Lista repetible (GPS + foto propios) |
|---|---|---|---|---|
| 6.1 | Zona y Transecto | Transecto (1–177) | Punto centro del transecto | Indicios encontrados (0..N) |
| 6.2 | Parcela | Parcela (1–177) | Punto centro de la parcela | Indicios encontrados (0..N) |
| 6.3 | Calicatas | Calicata (1–177) | Punto de la calicata | Individuos de geófita encontrados (0..N) |

Cada indicio (6.1/6.2) o individuo (6.3) puede tener su propio punto GPS y su
propia fotografía, independientes del punto/foto principal del registro.

## Arquitectura (misma base que Control_VeranoEnergy)

- **Offline-first**: IndexedDB (`js/db.js`, 3 object stores: `registros_61`,
  `registros_62`, `registros_63`). Instalable como PWA, funciona sin señal (`sw.js`).
- **GPS + foto con geo-sello**: mismo patrón que la versión original de
  Control_VeranoEnergy (antes de que se simplificara ese formulario para dejar solo
  avance agregado) — captura `navigator.geolocation`, conversión a UTM
  (`js/utm.js`), y estampado de texto (proyecto, EDT, evaluadora, fecha, UTM) sobre
  la foto vía Canvas antes de guardarla.
- **Sincronización manual** contra el **mismo Web App de Apps Script** que usa el
  formulario de avance (`apps-script/Codigo.gs`, en el repo
  `Control_VeranoEnergy`) — no se crea un backend nuevo. El payload incluye
  `tipo: 'registro_individual'` para que el script lo enrute a las hojas
  correctas sin afectar el flujo de avance.

## Estructura

```
index.html              · interfaz (3 formularios + Exportar), cada uno con sub-tabs Nuevo/Registros
css/styles.css          · estilos (incluye bloques repetibles de indicios/individuos)
js/app.js               · formularios, GPS, foto con geo-sello, listas, navegación
js/catalog.js           · proyecto, responsables, catálogos de dropdowns
js/db.js                · IndexedDB — 3 stores (uno por EDT)
js/utm.js               · conversión lat/lon → UTM (idéntico a Control_VeranoEnergy)
js/export.js            · exportación Excel multi-hoja (Registros + Indicios/Individuos)
js/sync.js              · sincronización con el Apps Script del proyecto
js/xlsx-mini.js         · generador XLSX en JS puro, offline (idéntico a Control_VeranoEnergy)
manifest.webmanifest    · metadatos PWA
sw.js                   · service worker (cache offline)
icons/                  · logo Biocys + íconos de la app
```

## Modelo de datos

Cada registro principal (`registros_61`/`registros_62`/`registros_63`) guarda:
`record_id, proyecto_id, nombre_proyecto, zona, fecha, evaluadora, numero_unidad,
utm_este, utm_norte, huso, foto, observaciones` + campos propios del EDT
(`presencia_vegetacion_acompanante`/`presencia_curureras` en 6.1;
`tipo_vegetacion`/`especies`/`presencia_curureras` en 6.2; `presencia_geofita` en
6.3) + una lista embebida `indicios[]` (6.1/6.2) o `individuos[]` (6.3), cada
elemento con sus propios `utm_este, utm_norte, huso, foto, observaciones`
(indicios) o `profundidad_cm, estado_fenologico, estado_sanitario, foto`
(individuos).

## Google Sheets generado (extensión de Codigo.gs)

Al sincronizar, el Apps Script crea (si no existen) y hace upsert idempotente por
`record_id` en:

- **Registros_6.1** / **Indicios_6.1**
- **Registros_6.2** / **Indicios_6.2**
- **Registros_6.3** / **Individuos_6.3**

Las fotos (principal y de cada indicio/individuo) se suben a la misma carpeta de
Drive que usa el formulario de avance, y la hoja guarda la URL (`foto_url`) en vez
del base64.

## Despliegue

### 1. Apps Script

No se crea un Web App nuevo: se **pega el contenido actualizado** de
`apps-script/Codigo.gs` (en el repo `Control_VeranoEnergy`) sobre el script ya
desplegado — la URL `.../exec` no cambia. Ver ese repo para el detalle.

### 2. PWA (GitHub Pages)

1. Crea un repo nuevo en GitHub (ej. `Registros_VeranoEnergy`) y publica esta
   carpeta (vía GitHub Desktop: "Add Existing Repository" → "Publish repository").
2. **Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta
   `/ (root)`.
3. La app queda en `https://<usuario>.github.io/<repo>/` (HTTPS habilita
   instalación, GPS y cámara).
4. Pega la URL del Web App en **Exportar → URL de sincronización** (ya viene
   precargada por defecto, igual que en Control_VeranoEnergy).

## Pruebas antes de usar en terreno

1. **Offline**: desconecta el wifi/datos, registra un transecto completo con GPS y
   foto (más un indicio) — debe guardarse sin error.
2. **Los 3 formularios**: registra al menos un transecto, una parcela y una
   calicata (con un individuo), y confirma que las 3 listas y el badge de conteo
   se actualizan correctamente.
3. **Resincronización**: sincroniza, corta la conexión a mitad de un lote y
   verifica que al reintentar no se dupliquen filas (upsert por `record_id`).
4. **Exportar**: descarga el Excel y confirma que las 6 hojas (Registros +
   Indicios/Individuos por EDT) tienen los datos esperados.

## Próximos pasos

- Confirmar con el equipo de terreno si conviene renumerar/editar indicios o
  individuos ya guardados (hoy solo se puede eliminar el registro completo y
  crear uno nuevo).
- Evaluar si el N° de transecto/parcela/calicata debe cruzarse contra un catálogo
  de zonas (SIG) en una versión futura.
