# Cómo actualizar el script en Google (paso a paso)

Guía para actualizar el backend sin ser programador. Toma unos 5 minutos.

## Antes de empezar: por qué hay que hacer esto

Existen **dos copias separadas** del archivo `Codigo.gs`:

```
  GitHub (este repo)              Google (lo que se ejecuta de verdad)
  apps-script/Codigo.gs    ✂️      Editor de Apps Script
```

**No están conectadas.** Git no le habla a Google. Cuando el archivo del repo
cambia, Google sigue ejecutando la versión vieja hasta que alguien la copia a
mano. Este documento es ese "a mano".

## Concepto: *implementación* (deployment)

Una **implementación** es una foto congelada del script, publicada en una URL
`.../exec`. La app de terreno le envía los datos a esa URL.

Lo importante: **guardar el archivo NO actualiza la implementación.** Son dos
acciones distintas. Si solo guardas, la URL sigue sirviendo la foto antigua.

Y hay dos formas de publicar, con consecuencias muy distintas:

| | Qué hace | Cuándo usarla |
|---|---|---|
| **Nueva implementación** | Crea una URL **nueva** | Solo la primera vez |
| **Administrar → editar ✏️ → Nueva versión** | Actualiza la URL **existente** | **Siempre después** |

⚠️ Si creas una implementación nueva cuando ya existía una, la URL cambia y la
app queda enviando datos a la dirección antigua. **Los datos no llegan y nadie
se entera**, porque el deployment viejo sigue vivo y responde "ok".

## Los pasos

### 1. Copiar el archivo desde GitHub

Abre `apps-script/Codigo.gs` en GitHub, en la rama `main`. Presiona el botón de
**copiar** (el ícono de dos hojitas, arriba a la derecha del archivo). Eso copia
el archivo completo.

### 2. Abrir el editor de Apps Script

Dos caminos:

- Desde la planilla: **Extensiones → Apps Script**.
- O entra a **https://script.google.com/home**, que lista *todos* tus proyectos
  de Apps Script. Útil cuando no recuerdas a qué planilla estaba asociado uno.

### 3. Reemplazar el contenido

Selecciona **todo** lo que hay en el editor (Ctrl+A o Cmd+A) y pega encima.
Debe quedar solo el archivo nuevo, sin restos del anterior.

Guarda con **Ctrl+S** (o Cmd+S). Guardar no publica nada todavía.

### 4. Publicar

- **Si es la primera vez** (nunca hubo implementación):
  **Implementar → Nueva implementación → Aplicación web**
  - Ejecutar como: **Yo**
  - Quién tiene acceso: **Cualquier persona**
  - Copia la URL `.../exec` y pégala en la app (Exportar → URL de
    sincronización) o pásasela a quien mantiene el repo.

- **Si ya existía una implementación** (el caso habitual):
  **Implementar → Administrar implementaciones → editar (✏️) →
  Versión: Nueva versión → Implementar**
  - La URL **no cambia**. No hay que tocar nada en la app.

### 5. Comprobar que quedó bien

Abre la URL `.../exec` en el navegador. Debe responder algo así:

```json
{
  "status": "ok",
  "mensaje": "Verano Energy – Registros de terreno – API activa",
  "planilla_nombre": "<el nombre de tu planilla>",
  "planilla_url": "https://docs.google.com/spreadsheets/d/...",
  "hojas_existentes": ["Registros_6.2", "Elementos_6.2", "KPI"]
}
```

**`planilla_nombre` es la prueba definitiva** de a qué archivo está escribiendo
ese deployment. Si no es tu planilla, el `SPREADSHEET_ID` del script está mal.

Si responde `"status": "error"`, el mensaje dice qué pasa. Los dos casos
típicos: el ID quedó mal pegado, o la cuenta de Google que ejecuta el script no
tiene permiso sobre esa planilla.

### 6. Prueba real

Registra una unidad en la app y sincroniza. Las hojas se crean solas.

En `Elementos_6.2`, una parcela con **una especie y un indicio** debe generar
**dos filas**: una `ESPECIE` y otra `INDICIO`, con las columnas del otro tipo
vacías. Si aparece una sola fila mezclada, algo salió mal.

## Recordatorio

Este proyecto tiene **dos scripts distintos**, uno por app, cada uno con su
propia implementación y su propia URL:

| App | Script | Escribe en |
|---|---|---|
| verano-energy-registros | `apps-script/Codigo.gs` de este repo | `Registros_6.x`, `Elementos_6.2`, `KPI` |
| Control_VeranoEnergy | `apps-script/Codigo.gs` de *aquel* repo | `Datos_Avance`, `Resumen_Proyecto`, `CONFIG_*` |

Ambos apuntan a **la misma planilla** (misma constante `SPREADSHEET_ID`), pero
escriben en hojas distintas. Que tengan URLs `/exec` diferentes es correcto: son
dos aplicaciones separadas.
