# 🌿 Verano Energy — Registros de terreno (PWA)

Formulario web instalable y **100 % offline** para el registro individual de cada
unidad de terreno del proyecto **Verano Energy**: un registro por **transecto**
(EDT 6.1), por **parcela** (EDT 6.2) y por **calicata** (EDT 6.3), cada uno con su
propio **punto GPS** y **fotografía georreferenciada**.

Es el complemento del formulario de **avance agregado**
([Control_VeranoEnergy](https://github.com/Neecocad/Control_VeranoEnergy)): aquel
registra cuánto se avanzó cada día (sin foto ni GPS), este registra **el detalle de
cada unidad** levantada en terreno. Las dos apps escriben en **la misma planilla**
de Google Sheets, en hojas distintas, con un backend de Apps Script independiente
cada una (ver "Una planilla, dos apps"). Los datos conviven en el mismo archivo,
pero no se cruzan solos: nada relaciona automáticamente una jornada de avance con
las unidades levantadas ese día.

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
- **Sincronización manual** contra un Web App de Apps Script **propio**
  (`apps-script/Codigo.gs`, en este mismo repo). Antes era una copia sin versionar
  del script de `Control_VeranoEnergy`, con la constante `SPREADSHEET_ID` cambiada
  a mano; ahora cada app lleva el suyo y solo hay que editar esa constante. Este
  script atiende únicamente `tipo: 'registro_individual'` y rechaza con un mensaje
  claro cualquier otro payload.

### Una planilla, dos apps

El avance agregado (`Control_VeranoEnergy`) y este detalle por unidad escriben en
la **misma planilla de Google Sheets**, cada uno con **su propio deployment** y su
propia URL `/exec`. No se pisan porque usan hojas distintas:

| App | Deployment | Hojas que escribe |
|---|---|---|
| Control_VeranoEnergy (avance) | el suyo | `Datos_Avance`, `Resumen_Proyecto`, `CONFIG_*`, `CATALOGOS` |
| verano-energy-registros (detalle) | el suyo | `Registros_6.x`, `Indicios_6.1`, `Elementos_6.2`, `Individuos_6.3` |

Cada script rechaza el payload del otro con un mensaje explicativo, así que una
URL mal pegada en una app se nota de inmediato en vez de escribir datos en el
lugar equivocado.

## Estructura

```
apps-script/Codigo.gs   · Web App de esta app: Sheets multi-hoja + fotos a Drive
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

La zona es texto libre en los 3 formularios, así que el número del prefijo `Z`
se extrae de lo escrito: «3», «Zona 3» y «Z3» dan igual `Z03`. Si el texto no
tiene ningún número no se puede formar el código, y el formulario lo avisa y no
deja crear elementos hasta corregirlo (un elemento sin código de parcela no
tendría cómo armar su propio `codigo_elemento`).

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

### Elementos_6.2 y actualización del Apps Script

El detalle de 6.2 dejó de ser solo indicios: ahora son **elementos** (especies +
indicios) y van a la hoja **Elementos_6.2**, no a `Indicios_6.2` (que se conserva
intacta con los datos históricos, porque tenía otro esquema de columnas).

`apps-script/Codigo.gs` (este repo) ya viene con todo esto. Para que tome efecto
hay que pegarlo en el editor de Apps Script de la planilla y volver a implementar
(ver "Despliegue").

El script no necesita una planilla en blanco: lee el encabezado real de cada hoja
y agrega al final solo las columnas que falten, sin mover ni reordenar las que ya
tienen datos. Si la planilla venía de la versión anterior, las filas históricas de
`Registros_6.2` quedan tal cual y solo ganan cuatro columnas nuevas (`parcela_id`,
`codigo_parcela`, `ultimo_numero_especie`, `ultimo_numero_indicio`). Si la planilla
es nueva, crea todas las hojas con su encabezado completo en el primer sync.

Las fotos del detalle pasaron a nombrarse por el código o el número estable del
ítem (`{record_id}_Z01-P001-E01.jpg`) en vez de por su posición en la lista, para
que borrar un elemento no reasigne las fotos de los demás en Drive. Un registro
antiguo que se resincronice creará el archivo con el nombre nuevo; el anterior
queda en Drive y se puede borrar a mano.

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

## Hoja KPI (seguimiento y control, uso interno)

El script genera y mantiene una hoja **`KPI`** en la misma planilla. Son fórmulas
vivas, no valores calculados: se recalculan solas al abrir o sincronizar la
planilla, sin volver a correr nada. Es de uso interno por construcción — la ve
quien tenga acceso a la planilla, y la PWA de terreno no la muestra.

Un detalle importante: la PWA es offline-first y **cada celular guarda solo sus
propios registros**, así que un panel dentro de la app reflejaría un único
dispositivo. El consolidado del proyecto solo tiene sentido donde converge todo,
que es la planilla.

### Qué contiene

- **Parámetros** (los completa el equipo a mano): valor unitario por EDT, monto
  total del contrato, valor de la hora-hombre y HH presupuestadas. Sin ellos, las
  secciones de valorización y desviación quedan en cero, pero el resto funciona
  igual.
- **Avance vs meta** — registros y unidades levantadas contra las 177 de cada EDT,
  % de avance, ponderación (33,33 / 33,33 / 33,34), aporte ponderado y fecha del
  último registro.
- **Valorización del servicio** — monto ejecutado por EDT y total, % del contrato,
  saldo por ejecutar, y el monto según avance ponderado como contraste para
  contratos que se pagan por hito en vez de por unidad.
- **Control de consistencia** — por EDT, lo que el avance **reporta** haber
  ejecutado contra las unidades que **efectivamente llegaron** desde esta app, con
  la diferencia y un estado legible. Una diferencia positiva significa jornadas
  reportadas sin respaldo de terreno: sin foto, sin GPS y sin evidencia para el
  informe. Solo es posible porque ambas apps escriben en la misma planilla.
- **Productividad** — días efectivos en terreno, unidades por día, ritmo de los
  últimos 7 días, unidades restantes y días estimados para terminar.
- **Horas-hombre y rendimiento** (desde `Datos_Avance`) — por EDT: HH acumuladas,
  HH por unidad, unidades por HH, jornadas, dotación promedio y duración media de
  jornada. Más la proyección de esfuerzo: HH estimadas para completar la meta, HH
  totales proyectadas, % del presupuesto consumido, desviación proyectada, costo
  de las HH ejecutadas y pendientes, costo en HH por unidad y margen estimado.
- **Calidad del dato** — duplicados (registros menos unidades distintas), cuántas
  faltan para la meta, % con foto y % con GPS por EDT.
- **Hallazgos ecológicos** — indicios por transecto, especies registradas y
  distintas, cobertura media, % de parcelas con curureras, % de calicatas con
  geófita e individuos por calicata.
- **Detalle** — tres tablas `QUERY` que crecen solas con los datos: unidades por
  persona evaluadora, HH por responsable, y la comparación **día a día** entre lo
  reportado en el avance y lo registrado en terreno. Van al final y en **columnas
  distintas**: si dos tablas expansibles se solaparan, Google Sheets bloquea la
  segunda con un error de "resultado no expandido".

### Notas de diseño

- El avance se mide con **unidades distintas** (`COUNTUNIQUE` del N° de unidad),
  no con el número de filas: una unidad registrada dos veces por error cuenta una
  sola vez contra la meta, y la diferencia aparece como "Duplicados".
- Las referencias a columnas se calculan desde el esquema (`COLUMNAS_*`), no se
  escriben a mano: si cambia el orden de las columnas, las fórmulas siguen
  apuntando al campo correcto.
- Todo lo que sale de `Datos_Avance` (HH, dotación, jornada, lo reportado) lo
  escribe la **otra** app. Va envuelto en `IFERROR`, así que si esa hoja todavía
  no existe el KPI muestra 0 en vez de `#REF`.
- Las posiciones de columna de `Datos_Avance` viven en `COL_AVANCE`. Ese esquema
  lo controla `Control_VeranoEnergy`, no esta app: si allá se reordenan las
  columnas, hay que actualizar esos números o el KPI leerá el dato equivocado.
- La comparación día a día se arma con **una sola** `QUERY`: las cuatro fuentes
  (avance y los 3 EDT) aportan las mismas cuatro columnas —fecha, EDT, reportado,
  registrado— rellenando con cero la que no les corresponde. Así un único
  `group by` devuelve ambas cifras enfrentadas, sin sumarlas entre sí ni generar
  producto cartesiano.
- Si falla la construcción del KPI, el registro **igual queda guardado**: el sync
  no se da por fallido y el error se informa aparte, en `kpi_error`.
- Para cambiar las fórmulas más adelante, sube `KPI_VERSION` en el script: la hoja
  se regenera **conservando los parámetros** que el equipo haya escrito.

## Despliegue

### 1. Apps Script (planilla y deployment propios)

> Guía paso a paso, pensada para hacerla con el navegador al lado:
> [`apps-script/COMO-ACTUALIZAR.md`](apps-script/COMO-ACTUALIZAR.md)

1. La planilla de destino ya está configurada en `apps-script/Codigo.gs`
   (`SPREADSHEET_ID`) y es la misma que usa el avance agregado. Para apuntar a
   otra, cambia **solo** esa constante: es lo que va entre `/d/` y `/edit` en la
   URL de la planilla. Si queda el marcador `PEGA_AQUI_EL_ID_DE_LA_PLANILLA`, el
   script responde con un error explícito en vez de escribir en cualquier parte.
2. En esa planilla: **Extensiones → Apps Script**, borra todo y pega el archivo
   completo. Guarda (Cmd/Ctrl+S).
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como "Yo",
   acceso "Cualquier persona". Copia la URL `.../exec`.
4. Pega esa URL en `js/sync.js` (`DEFAULT_URL`) o en la app, pestaña
   **Exportar → URL de sincronización**.
5. Sincroniza un registro de prueba: las hojas `Registros_6.x` / `Indicios_6.1` /
   `Elementos_6.2` / `Individuos_6.3` se crean solas en esta planilla.

**Para cambiar de planilla después**, sin rehacer el deployment: edita
`SPREADSHEET_ID`, pega el archivo de nuevo en el editor, guarda, y **Implementar →
Administrar implementaciones → editar (✏️) → Versión: Nueva versión →
Implementar**. Editar la implementación existente conserva la misma URL `/exec`,
así que no hay que tocar nada en la app ni en los celulares del equipo. Lo mismo
aplica para cualquier actualización del script.

Comprobación rápida de a qué planilla apunta el deployment: abre su URL `/exec` en
el navegador (un GET simple). Responde
`{"status":"ok","mensaje":"Verano Energy – Registros de terreno – API activa",
"planilla_configurada":true}`. Si `planilla_configurada` es `false`, falta el ID.

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
