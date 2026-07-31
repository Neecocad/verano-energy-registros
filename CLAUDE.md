# Contexto para Claude

## Cómo comunicarse en este proyecto

Quien mantiene este repositorio **no es programador de oficio** y quiere entender
lo que se construye, no solo recibirlo funcionando. Además del rol de ejecutor,
programador y auditor, se espera un **rol pedagógico**:

- Explicar el **porqué** de cada decisión, no solo el qué. Si hay una alternativa
  descartada, decir en una línea por qué se descartó.
- Traducir el término técnico la primera vez que aparece (qué es un *deployment*,
  qué es `localStorage`, qué significa *idempotente*), con una analogía breve
  cuando ayude.
- Señalar las **trampas**: dónde algo puede fallar en silencio, qué pasaría si se
  hiciera de otra forma, qué conviene verificar a mano.
- Al terminar un cambio, indicar **qué mirar para comprobar que funciona**.
- No dar por sabido el contexto de Google Apps Script, PWA, IndexedDB ni Git.
- Nada de esto significa alargar la respuesta por alargarla: explicar lo que
  aporta entendimiento, no narrar cada paso mecánico.

## Qué es este proyecto

PWA offline-first para registro de terreno del proyecto **Verano Energy**
(consultora Biocys). Un registro por unidad levantada: transecto (EDT 6.1),
parcela (EDT 6.2) y calicata (EDT 6.3), cada uno con punto GPS y fotografía con
geo-sello. Se usa en terreno, **sin señal**, en celulares.

Es el complemento de [Control_VeranoEnergy](https://github.com/Neecocad/Control_VeranoEnergy),
que registra el avance agregado diario. Ambas apps escriben en **la misma planilla
de Google Sheets**, en hojas distintas, con un deployment de Apps Script propio
cada una.

## Reglas del dominio que no se deben romper

- **Códigos estables (EDT 6.2)**: `codigo_parcela` (`Z01-P001`) y
  `codigo_elemento` (`Z01-P001-E01` / `-I01`) se asignan **una vez** al crear y no
  se recalculan nunca por posición visual. Un correlativo eliminado **no se
  reutiliza** ni renumera a los demás. No debe existir ninguna función de
  renumeración: si aparece una, es un bug. Ver `js/codigos.js`.
- **UUID ≠ código visible**: `parcela_id`/`elemento_id` son identificadores
  técnicos; `codigo_parcela`/`codigo_elemento` son los que lee una persona. Se
  guardan **los dos**.
- **Una fila por elemento** en la planilla: nunca combinar una especie con un
  indicio en la misma fila, ni generar producto cartesiano entre ellos.
- **Offline primero**: nada puede depender de que haya red al momento de
  registrar. Los códigos se generan en el dispositivo.
- **El geo-sello va estampado sobre el pixel** (Canvas), no en EXIF, porque los
  metadatos se pierden al compartir la foto.

## Estructura

- `apps-script/Codigo.gs` — backend de ESTA app (Web App de Apps Script). El
  `SPREADSHEET_ID` de arriba es el único valor a cambiar para apuntar a otra
  planilla. Genera además la hoja `KPI`.
- `js/` — la app: `app.js` (formularios), `codigos.js` (identificadores),
  `db.js` (IndexedDB), `sync.js` (envío al Web App), `export.js` (Excel).
- El `README.md` documenta el modelo de datos y el despliegue paso a paso.

## Al trabajar aquí

- **Verificar de verdad, no asumir.** El patrón usado hasta ahora: probar la app
  real en Chromium con Playwright, y el Apps Script contra una planilla simulada
  en Node (Apps Script no se puede ejecutar localmente). Si una prueba falla,
  revisar si el error está en la prueba o en el código antes de "arreglar".
- **Cambiar el Apps Script no basta**: hay que pegarlo en el editor de Google y
  volver a implementar. Es un paso manual que siempre debe recordarse.
- Al cambiar `js/sync.js` o cualquier archivo cacheado, subir `CACHE` en `sw.js`
  y `VERSION` en `js/app.js`.
