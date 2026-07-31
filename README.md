# 🌿 Verano Energy — Registros de terreno (PWA)

Formulario web instalable y **100 % offline** para el registro individual de cada
unidad de terreno del proyecto **Verano Energy**: un registro por **transecto**
(EDT 6.1), por **parcela** (EDT 6.2) y por **calicata** (EDT 6.3), cada uno con su
propio **punto GPS** y **fotografía georreferenciada**.

Es el complemento del formulario de **avance agregado**
([Control_VeranoEnergy](https://github.com/Neecocad/Control_VeranoEnergy)): aquel
registra cuánto se avanzó cada día (sin foto ni GPS), este registra **el detalle de
cada unidad** levantada en terreno. Cada app sincroniza contra **su propia
planilla** de Google Sheets — son dos planillas y dos backends de Apps Script
independientes (no se cruzan datos automáticamente entre avance agregado y
detalle por unidad; ver "Próximos pasos" en el README de `Control_VeranoEnergy`).

## Qué registra cada formulario

| EDT | Formulario | Unidad | Punto GPS + foto principal | Lista repetible (GPS + foto propios) |
|---|---|---|---|---|
| 6.1 | Zona y Transecto | Transecto (1–177) | Punto centro del transecto | Indicios encontrados (0..N) |
| 6.2 | Parcela | Parcela (1–177) | Punto centro de la parcela | **Elementos encontrados**: especies e indicios (0..N de cada tipo) |
| 6.3 | Calicatas | Calicata (1–177) | Punto de la calicata | Individuos de geófita encontrados (0..N) |

Cada indicio (6.1/6.2) o individuo (6.3) puede tener su propio punto GPS y su
propia fotografía, independientes del punto/foto principal del registro.

### Geo-sello de las fotografías

Toda foto de los 3 formularios —principal, de indicio, de especie y de
individuo— se estampa por Canvas antes de guardarse, de modo que el sello viaja
con el archivo a Drive y no depende de metadatos EXIF. El sello incluye siempre
**nombre del proyecto** y **coordenadas UTM**, más EDT y unidad (con el código de
parcela en 6.2), zona, el elemento al que pertenece, la persona evaluadora y la
fecha/hora local. Cuando el bloque no tiene punto propio (especies, individuos de
calicata) se usa el punto principal de la unidad y el sello lo declara como tal,
p. ej. `UTM 19S: 346813 E · 6296844 N (punto de parcela)`.

### Persona evaluadora

El desplegable lista el catálogo de `js/catalog.js` (Juan Araya al final) y cierra
con **"Otro (especificar)"**, que habilita un campo de texto para iniciales o un
nombre escrito. El valor efectivo —el del catálogo o el texto libre— es el que se
guarda en `evaluadora` y el que llega a la planilla y al geo-sello.

## Arquitectura (misma base que Control_VeranoEnergy)

- **Offline-first**: IndexedDB (`js/db.js`, 3 object stores: `registros_61`,
  `registros_62`, `registros_63`). Instalable como PWA, funciona sin señal (`sw.js`).
- **GPS + foto con geo-sello**: mismo patrón que la versión original de
  Control_VeranoEnergy (antes de que se simplificara ese formulario para dejar solo
  avance agregado) — captura `navigator.geolocation`, conversión a UTM
  (`js/utm.js`), y estampado de texto (proyecto, EDT, evaluadora, fecha, UTM) sobre
  la foto vía Canvas antes de guardarla.
- **Sincronización manual** contra un Web App de Apps Script **propio**, desplegado
  sobre su **propia planilla** de Google Sheets (independiente de la que usa
  Control_VeranoEnergy). Ese script es una copia de `apps-script/Codigo.gs` (del
  repo `Control_VeranoEnergy`) con la constante `SPREADSHEET_ID` apuntando a esta
  planilla nueva en vez de la de avance. El payload incluye
  `tipo: 'registro_individual'` para que el script lo enrute a las hojas
  correctas; la rama `tipo: 'avance'` del script queda presente pero sin uso en
  este deployment.

## Estructura

```
index.html              · interfaz (3 formularios + Exportar), cada uno con sub-tabs Nuevo/Registros
css/styles.css          · estilos (incluye bloques repetibles de indicios/individuos/elementos)
js/app.js               · formularios, GPS, foto con geo-sello, listas, navegación
js/catalog.js           · proyecto, responsables, catálogos de dropdowns
js/codigos.js           · UUID y códigos visibles estables (parcela y elementos)
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
`tipo_vegetacion`/`presencia_curureras` en 6.2; `presencia_geofita` en
6.3) + una lista embebida `indicios[]` (6.1), `especies[]` + `indicios[]` (6.2) o
`individuos[]` (6.3), cada elemento con sus propios `utm_este, utm_norte, huso,
foto, observaciones` (indicios) o `profundidad_cm, estado_fenologico,
estado_sanitario, foto` (individuos).

### EDT 6.2 · Códigos estables de parcela y elementos

La parcela conserva dos identificadores que **no son lo mismo** y se guardan
ambos: `parcela_id` (UUID técnico inmutable) y `codigo_parcela` (código visible
`Z{zona 2 díg}-P{parcela 3 díg}`, p. ej. `Z01-P001`, `Z02-P015`, `Z12-P177`). El
código se genera localmente en la PWA, sin internet, en cuanto existen zona y N°
de parcela, y queda congelado al crearse el primer elemento.

Cada elemento de "Elementos encontrados" lleva `elemento_id` (UUID),
`tipo_fila` (`ESPECIE` o `INDICIO`, asignado por la app según el botón que se
presionó — no hay ningún campo `tipo_fila` editable), `numero_elemento` y
`codigo_elemento` (`{codigo_parcela}-E{2 díg}` para especies,
`{codigo_parcela}-I{2 díg}` para indicios).

Los correlativos de especies e indicios se administran por separado, en
`ultimo_numero_especie` y `ultimo_numero_indicio`, y **solo suben**: el código se
asigna una vez al crear el elemento y no se recalcula por posición visual, ni al
reordenar, ni al editar el registro. Los correlativos eliminados no se reutilizan
—de `E01, E02, E03` se borra `E02` y la siguiente especie es `E04`, sin renumerar
`E03`— y por eso no existe (ni debe agregarse) ninguna función de renumeración.

```js
{
  parcela_id: "UUID", codigo_parcela: "Z01-P001",
  ultimo_numero_especie: 3, ultimo_numero_indicio: 2,
  especies: [{ elemento_id: "UUID", tipo_fila: "ESPECIE", numero_elemento: 1,
               codigo_elemento: "Z01-P001-E01", nombre_especie: "Espino",
               cobertura_porcentaje: 30, observaciones_especie: "", foto: null }],
  indicios: [{ elemento_id: "UUID", tipo_fila: "INDICIO", numero_elemento: 1,
               codigo_elemento: "Z01-P001-I01", tipo_indicio: "Cururera",
               tipo_indicio_otro: "", observaciones_indicio: "",
               utm_este: null, utm_norte: null, huso: null, foto: null }],
}
```

## Google Sheets generado (extensión de Codigo.gs)

Al sincronizar, el Apps Script crea (si no existen) y hace upsert idempotente por
`record_id` en:

- **Registros_6.1** / **Indicios_6.1**
- **Registros_6.2** / **Elementos_6.2**
- **Registros_6.3** / **Individuos_6.3**

### ⚠️ Elementos_6.2 requiere actualizar el Apps Script

El detalle de 6.2 dejó de ser solo indicios: ahora son **elementos** (especies +
indicios) y van a la hoja **Elementos_6.2**, no a `Indicios_6.2`. El payload de
sincronización incluye `hoja_detalle` con el nombre de la hoja de destino, así que
`Codigo.gs` debe leer ese campo (o mapear `6.2 → Elementos_6.2`) en vez de asumir
`Indicios_6.x`. Mientras no se actualice, los registros 6.2 nuevos seguirán
escribiéndose en la hoja antigua con columnas que no calzan.

Cada especie y cada indicio produce **una fila independiente**; las columnas
propias de un tipo quedan vacías en las filas del otro, y no se combinan ni se
cruzan entre sí (3 especies + 2 indicios = exactamente 5 filas). Columnas de
`Elementos_6.2`:

`elemento_id, codigo_parcela, tipo_fila, numero_elemento, codigo_elemento,
nombre_especie, cobertura_porcentaje, observaciones_especie, tipo_indicio,
tipo_indicio_otro, utm_este, utm_norte, huso, codigo_gps_indicio,
observaciones_indicio, foto`

| codigo_parcela | tipo_fila | codigo_elemento | nombre_especie | cobertura_porcentaje | tipo_indicio |
|---|---|---|---|---|---|
| Z01-P001 | ESPECIE | Z01-P001-E01 | Espino | 30 | |
| Z01-P001 | ESPECIE | Z01-P001-E02 | Huingán | 15 | |
| Z01-P001 | INDICIO | Z01-P001-I01 | | | Cururera |

Las fotos (principal y de cada indicio/individuo) se suben a Drive, dentro de una
carpeta base "Verano Energy - Fotos" (se crea sola si no existe) en el Drive de
la cuenta que ejecuta este deployment del script. Dentro de esa carpeta base, el
script crea automáticamente una **subcarpeta por EDT** — `EDT 6.1`, `EDT 6.2`,
`EDT 6.3` — para que las fotos de transectos, parcelas y calicatas no se mezclen.
La hoja guarda la URL (`foto_url`) en vez del base64. **Nota:** si este Apps
Script se desplegó bajo la misma cuenta de Google que Control_VeranoEnergy,
ambos comparten la carpeta base "Verano Energy - Fotos" por nombre (pero cada
uno sigue escribiendo en sus propias subcarpetas por EDT); si se desplegó bajo
otra cuenta, se crea una carpeta base independiente.

## Despliegue

### 1. Apps Script (planilla y deployment propios)

1. Crea una planilla nueva en Google Sheets (distinta de la de avance) y copia su
   ID (entre `/d/` y `/edit` en la URL).
2. En esa planilla: **Extensiones → Apps Script**, pega el contenido de
   `apps-script/Codigo.gs` (del repo `Control_VeranoEnergy`).
3. Reemplaza la constante `SPREADSHEET_ID` (cerca del inicio del archivo) por el
   ID de **esta** planilla nueva — es crítico: si se deja el ID de la planilla de
   avance, los datos se seguirían escribiendo ahí por error.
4. Guarda (Cmd/Ctrl+S) y **Implementar → Nueva implementación → Aplicación web**:
   ejecutar como "Yo", acceso "Cualquier persona". Copia la URL `.../exec`.
5. Pega esa URL en `js/sync.js` (`DEFAULT_URL`) o en la app, pestaña
   **Exportar → URL de sincronización**.
6. Sincroniza un registro de prueba: las hojas `Registros_6.x` /
   `Indicios_6.1`/`6.2` / `Individuos_6.3` se crean solas en esta planilla nueva.

Si más adelante se actualiza `Codigo.gs` en el repo `Control_VeranoEnergy`, hay
que replicar el cambio manualmente aquí también (son dos copias independientes
del mismo script, no un código compartido).

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
   Indicios/Elementos/Individuos por EDT) tienen los datos esperados.
5. **Códigos de 6.2**: agrega 3 especies, elimina la segunda, agrega otra y
   verifica que la nueva sea `E04` (no `E02`) y que la tercera siga siendo `E03`.

## Próximos pasos

- Confirmar con el equipo de terreno si conviene renumerar/editar indicios o
  individuos ya guardados (hoy solo se puede eliminar el registro completo y
  crear uno nuevo).
- Evaluar si el N° de transecto/parcela/calicata debe cruzarse contra un catálogo
  de zonas (SIG) en una versión futura.
