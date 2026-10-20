# Instalación del Copiloto de Tutorías (prototipo)

Guía para instalar la aplicación en la cuenta de Google de Impulsa, sin experiencia previa en
Apps Script. Se hace una sola vez; la sección 6 explica cómo actualizar el código después y la
sección 7 cómo cargar los datos reales del semestre.

**Si ya instalaste el primer prototipo**, no repitas las secciones 1 a 5: ve directo a la
sección 7, que dice qué volver a pegar y qué cargar.

**Si ya tienes la segunda versión** (tutores, duplas e integrantes), ve directo a la sección 9:
agrega el Panel de seguimiento.

Necesitas:

- La cuenta de Google de Impulsa (no una cuenta personal: la app y las actas quedan en el
  Drive de esa cuenta).
- Una clave de la API de Gemini creada con esa misma cuenta, en
  [Google AI Studio](https://aistudio.google.com/apikey) (gratuita).
- Los cinco archivos de la carpeta `src/` de este repositorio, abiertos en un editor de texto
  (el Bloc de notas sirve) para copiar su contenido.
- Los tres archivos de datos reales del semestre, en
  `C:\Users\ignac\Proyectos\copiloto-tutorias-appscript\datos\`: `tutores.csv`,
  `duplas.csv` y `equipos.csv`. No están en git: viven solo en tu computador y en la planilla.

**Sobre los nombres de los menús.** Están escritos en inglés tal como aparecen en la
documentación oficial de Google. Cuando el editor está en español, se agrega entre paréntesis
la etiqueta que usa la documentación de Google en español. Las pocas etiquetas que no se
pudieron verificar en la documentación oficial están marcadas como tales.

---

## 1. Crear la planilla y abrir el editor de Apps Script

1. Entra a [Google Drive](https://drive.google.com) con la cuenta de Impulsa.
2. Crea una hoja de cálculo nueva de Google Sheets y ponle de nombre
   `Copiloto de Tutorías`.
3. En la planilla, haz clic en **Extensions > Apps Script** (en español:
   **Extensiones > Apps Script**). Se abre el editor en otra pestaña, con un proyecto ligado a
   esta planilla.
4. Arriba a la izquierda, haz clic en el nombre del proyecto, escribe `Copiloto de Tutorías`
   y confirma con **Rename** (etiqueta de la documentación en inglés; no se pudo verificar la
   del editor en español).

## 2. Crear los cinco archivos

El proyecto trae un archivo de código de ejemplo (`Code.gs` o `Código.gs`). Debe quedar con
estos cinco archivos, con estos nombres y tipos exactos:

| Archivo en el editor | Tipo | Contenido que se pega |
| --- | --- | --- |
| `Codigo.gs` | Script | `src/Codigo.gs` |
| `Datos.gs` | Script | `src/Datos.gs` |
| `Index.html` | HTML | `src/Index.html` |
| `Estilos.html` | HTML | `src/Estilos.html` |
| `Cliente.html` | HTML | `src/Cliente.html` |

1. **Codigo.gs.** Abre el archivo de ejemplo que trae el proyecto. En el menú de tres puntos
   que aparece junto a su nombre, elige la opción para cambiarle el nombre y escribe
   `Codigo` (esta opción no está descrita en la documentación oficial). Borra todo su
   contenido, pega el contenido completo de `src/Codigo.gs` y guarda con el ícono de
   disquete (**Save**; en español, **Guardar**).
   - Si no encuentras cómo cambiarle el nombre, puedes dejarlo como está: el nombre de los
     archivos de Script no afecta el funcionamiento. Los nombres de los archivos HTML sí
     importan.
2. **Datos.gs.** A la izquierda, haz clic en **Editor** y luego en **Add** (el signo +; en
   español, **Agregar**). Elige **Script**, escribe `Datos` (sin extensión: el editor agrega
   `.gs`) y presiona Enter. Borra el contenido que trae, pega el de `src/Datos.gs` y guarda.
3. **Index.html.** Haz clic en **Add** (+) otra vez, elige **HTML** y escribe `Index`. El
   editor crea el archivo con una plantilla HTML: bórrala completa, pega el contenido de
   `src/Index.html` y guarda.
4. **Estilos.html.** Igual que el anterior, con el nombre `Estilos` y el contenido de
   `src/Estilos.html`.
5. **Cliente.html.** Igual, con el nombre `Cliente` y el contenido de `src/Cliente.html`.
6. Revisa la lista de archivos a la izquierda: deben aparecer los cinco, sin espacios ni
   tildes en los nombres y respetando mayúsculas (`Index`, no `index`).

## 3. Configurar la planilla y autorizar los permisos

1. Abre `Codigo.gs`. En la barra superior del editor, en la lista de funciones que está junto
   al botón **Debug** (etiqueta en español no verificada), elige `configurarPlanilla`.
2. Haz clic en **Run** (en español, **Ejecutar**).
3. La primera vez aparece una ventana que pide autorización. Haz clic en **Review
   permissions** (en español, **Revisar permisos**) y elige la cuenta de Impulsa.
4. Google muestra una advertencia de que la app no está verificada ("This app isn't
   verified"; en español, "Esta app no está verificada"). Es normal: la app es de Impulsa y
   no pasó por la revisión de Google porque no se publica para el público. Haz clic en
   **Advanced** (en español, **Opciones avanzadas**) y luego en
   **Go to Copiloto de Tutorías (unsafe)** (en español,
   **Ir a Copiloto de Tutorías (no seguro)**).
5. Revisa los permisos que pide y haz clic en **Allow** (en español, **Permitir**). Son:
   ver y editar esta planilla, crear documentos de Google, guardar y leer archivos en Drive
   (la carpeta de actas) y conectarse a un servicio externo (la API de Gemini).
6. Espera a que termine. Abajo aparece el registro de ejecución con un mensaje que empieza
   con `Planilla lista.` y dice qué pestañas creó y cuántas filas agregó (4 hitos de ejemplo y
   64 preguntas la primera vez).
7. Vuelve a la pestaña de la planilla. Ahora tiene trece pestañas:
   - **De referencia, las edita coordinación:** `Tutores`, `Duplas`, `Equipos`, `Hitos` y
     `Preguntas`. Las tres primeras quedan vacías: se llenan en la sección 7.
   - **Las escribe la app:** `Tutorias`, `Respuestas`, `PreguntasTutor`, `ConsultasEquipo`,
     `Compromisos` y `Actas`.
   - **Para Data Studio, las calcula el script:** `SemaforoDimensiones` y `EstadoEquipos`.

   En tu Drive apareció la carpeta `Copiloto de Tutorías - Actas`.

`configurarPlanilla` se puede correr de nuevo cuando quieras: agrega las pestañas y columnas que
falten, sin borrar ni pisar lo que ya esté en la planilla. Al reabrir la planilla aparece además
un menú **Copiloto** con dos opciones: **Configurar planilla**, que hace lo mismo, y
**Recalcular tablas de análisis**, que rehace `SemaforoDimensiones` y `EstadoEquipos`.

Las pestañas que escribe la app (y las dos de Data Studio) quedan **protegidas con
advertencia**: se pueden editar a mano, pero Sheets avisa antes. Es el camino manual si la app
falla; en uso normal no se tocan. La protección se ve y se quita en **Data > Protect sheets and
ranges** (en español, **Datos > Proteger hojas y rangos**).

En `Preguntas`, escribir `NO` en la columna `activa` retira una pregunta del guion;
`hito_numero` vacío significa "todos los hitos" y el Examen es el hito 4. Para retirar una
pregunta no borres la fila: `configurarPlanilla` volvería a agregarla.

## 4. Agregar la clave de Gemini

1. En el editor, en el panel de la izquierda, haz clic en el ícono de engranaje
   **Project Settings** (en español, **Configuración del proyecto**).
2. Baja hasta **Script Properties** (en español, **Propiedades de la secuencia de
   comandos**).
3. Ya hay propiedades creadas por `configurarPlanilla` (`ID_PLANILLA` e `ID_CARPETA_ACTAS`):
   no las cambies. Haz clic en **Edit script properties** (en español, **Editar las
   propiedades de las secuencias de comandos**) y luego en **Add script property** (en
   español, **Agregar propiedad de secuencia de comandos**).
4. En **Property** (en español, **Propiedad**) escribe exactamente `CLAVE_API_GEMINI`. En
   **Value** (en español, **Valor**) pega la clave de Gemini.
5. Haz clic en **Save script properties** (en español, **Guardar las propiedades de las
   secuencias de comandos**).

La clave queda solo en el proyecto: nunca en el código ni en git. Sin clave la app funciona
igual, pero el acta sale de la plantilla sin IA.

## 5. Desplegar como aplicación web

1. Arriba a la derecha del editor, haz clic en **Deploy > New deployment** (en español,
   **Implementar > Nueva implementación**).
2. Junto a **Select type** (en español, **Seleccionar tipo**), haz clic en el ícono de
   engranaje (**Enable deployment types**; en español, **Habilitar los tipos de
   implementación**) y elige **Web app** (en español, **App web**).
3. En la configuración de la implementación:
   1. En la descripción, escribe `Prototipo`.
   2. En el campo que define con qué cuenta se ejecuta la app, elige **tu cuenta** (la de
      Impulsa). La documentación lo describe como "Execute the app as me": la app lee y
      escribe la planilla con los permisos del propietario, así que los tutores no necesitan
      acceso a la planilla ni a la carpeta de actas.
   3. En el campo que define quién tiene acceso, elige la opción para **cualquier persona con
      cuenta de Google** (en la API de Google corresponde al valor `ANYONE`, "Any logged-in
      user"). Los rótulos exactos de estos dos campos no están en la documentación oficial.
4. Haz clic en **Deploy** (en español, **Implementar**). Si pide autorizar otra vez, repite
   los pasos 3.3 a 3.5.
5. Copia la **URL** de la aplicación web que muestra la ventana (termina en `/exec`). Esa es
   la dirección que se comparte con los tutores. Guárdala.

## 6. Actualizar el código sin cambiar la URL

Cuando cambie el código, el aviso del cambio dice qué archivos de `src/` volver a pegar.

1. En el editor, abre cada archivo que cambió, borra su contenido, pega el nuevo y guarda.
2. Si cambió `Codigo.gs` o `Datos.gs`, corre `configurarPlanilla` otra vez (pasos 3.1 y 3.2).
   Si pide autorizar permisos nuevos, repite los pasos 3.3 a 3.5.
3. Haz clic en **Deploy > Manage deployments** (en español, **Implementar > Administrar
   implementaciones**).
4. Selecciona la implementación activa y haz clic en **Edit** (el lápiz; en español,
   **Editar**).
5. En la sección **Version** (en español, **Versión**), elige **New version** (en español,
   **Versión nueva**).
6. Haz clic en **Deploy** (en español, **Implementar**).

La URL queda igual. No uses **New deployment** para actualizar: crea una URL distinta.

## 7. Cargar los datos reales del semestre (segunda versión)

Esta sección pasa la planilla a la segunda versión: tutores, duplas y equipos reales, con
integrantes. Si vienes del primer prototipo, hazla completa, en orden. Si instalaste desde cero,
empieza en el paso 7.3.

### 7.1 Volver a pegar los archivos

En esta versión cambiaron cuatro archivos de `src/`: `Codigo.gs`, `Datos.gs`,
`Estilos.html` y `Cliente.html`. `Index.html` no cambió. En el editor de Apps Script, abre
cada uno de los cuatro, borra todo su contenido, pega el nuevo y guarda (sección 6, paso 1).

### 7.2 Correr configurarPlanilla

1. Corre `configurarPlanilla` (pasos 3.1 y 3.2). Si pide autorizar permisos nuevos, repite los
   pasos 3.3 a 3.5.
2. El mensaje debe decir que creó las pestañas nuevas (`Tutores`, `Duplas`, `PreguntasTutor`,
   `ConsultasEquipo`, `Compromisos`, `SemaforoDimensiones` y `EstadoEquipos`) y que protegió con
   advertencia las que escribe la app. Las columnas nuevas de `Equipos`, `Tutorias` y
   `Respuestas` quedan al final de cada pestaña; las tutorías que ya estaban no se tocan.

### 7.3 Importar los tres CSV

Haz esto tres veces: `tutores.csv` en la pestaña `Tutores`, `duplas.csv` en `Duplas` y
`equipos.csv` en `Equipos`. Los archivos están en
`C:\Users\ignac\Proyectos\copiloto-tutorias-appscript\datos\`.

1. En la planilla, haz clic abajo en la pestaña donde va el archivo (por ejemplo, `Tutores`).
2. Haz clic en **File > Import** (en español, **Archivo > Importar**).
3. Sube el archivo CSV desde tu computador (no verificado: el nombre de la pestaña para subir
   archivos en esa ventana).
4. En las opciones de importación, elige **Replace current sheet** (en español, **Reemplazar
   la hoja actual**). En la pestaña `Equipos` esto borra los dos equipos ficticios del primer
   prototipo, que ya no se usan.
5. En **Separator character** (en español, **Carácter de separador**), deja **Detect
   automatically** (**Detectar automáticamente**) o elige **Comma** (**Coma**).
6. Si aparece una casilla para convertir texto en números, fechas y fórmulas, **desmárcala**
   (no verificado: la casilla no está en la documentación). Así `2026-2` queda como texto y no
   como una fecha.
7. Haz clic en **Import** (en español, **Importar**).
8. Revisa la pestaña: debe seguir llamándose igual, la fila 1 debe tener los encabezados del
   CSV (`alias`, `nombre`, ...) y la columna `semestre` debe decir `2026-2`. Si la planilla
   convirtió `semestre` en una fecha, selecciona la columna, déjala en formato de texto sin
   formato (no verificado: la ruta del menú) y escribe de nuevo `2026-2` en cada celda.

Después de importar las tres, usa **Copiloto > Recalcular tablas de análisis**: `EstadoEquipos`
queda con una fila por equipo activo.

### 7.4 Completar los nombres de los tutores

En la pestaña `Tutores`:

1. Escribe el apellido de cada tutor en la columna `apellido`. La página muestra
   "nombre apellido"; sin apellido muestra solo el nombre.
2. En las filas de **Cata O.** y **Cata P.**, escribe el nombre (y el apellido) en las
   columnas `nombre` y `apellido`. Mientras falte el nombre, la página muestra el alias.
3. **No cambies la columna `alias`**: la pestaña `Duplas` nombra a los tutores por su alias, y
   así se encuentra la dupla de cada par de tutores.
4. Para retirar a un tutor, escribe `FALSE` en `activo` en vez de borrar la fila. Lo mismo vale
   para `activa` en `Duplas` y `activo` en `Equipos`.

### 7.5 Reemplazar los hitos de ejemplo por los reales

La pestaña `Hitos` trae cuatro hitos ficticios de EL4030 (fechas 2026-09-01, 2026-10-06,
2026-11-10 y 2026-12-01).

1. Escribe los hitos reales, una fila por hito y curso: `semestre` (`2026-2`), `curso` (por
   ejemplo `EL5030`), `numero` (1, 2, 3; el Examen es 4), `nombre` (por ejemplo `Hito 2`) y
   `fecha` en formato `AAAA-MM-DD`.
2. Borra las filas de ejemplo que no correspondan.
3. Escribe los reales **antes** de dejar la pestaña vacía: `configurarPlanilla` vuelve a
   sembrar los de ejemplo solo si encuentra `Hitos` vacía.

Un curso sin hitos en la pestaña usa los genéricos (Hito 1, Hito 2, Hito 3 y Examen, sin
fecha). La página sugiere el próximo hito según la fecha de hoy.

### 7.6 Actualizar el despliegue sin cambiar la URL

Sigue la sección 6 desde el paso 3: **Deploy > Manage deployments**, **Edit**, **New version** y
**Deploy**. La URL que tienen los tutores sigue igual.

---

## 8. Comprobaciones

Haz las cinco en orden, con la URL del paso 5.

### 8.1 Abrir la página

1. Abre la URL en el computador. Si no tienes sesión iniciada, Google la pide.
2. Debe aparecer "Copiloto de Tutorías" con el fondo oscuro de Impulsa, el chip
   "Semestre 2026-2" y el paso 1, "¿Quiénes hacen la tutoría?", con dos menús desplegables. A
   la izquierda, el panel tiene seis pasos; "Preguntas del tutor" y "Consultas y compromisos"
   dicen "Opcional".
3. Ábrela también en un teléfono: el panel de pasos se reemplaza por "Paso 1 de 6" y una barra
   de avance.

Si dice que no se pudieron leer los datos de la planilla, revisa que hayas corrido
`configurarPlanilla` (sección 3).

### 8.2 Registrar una tutoría completa y verla en la planilla

1. **Paso 1.** En "Conduce la reunión" y "Toma notas", elige a los dos tutores de una dupla
   (por ejemplo, los de la primera fila de `Duplas`, en cualquier orden). Haz clic en
   **Siguiente**.
2. **Paso 2.** Arriba aparece la dupla y solo sus equipos. Prueba **Ver todos los equipos** y
   vuelve. Elige un equipo, revisa que el hito venga preseleccionado y marca dos integrantes
   presentes. Agrega uno a mano en "Agregar otro" (nombre y apellido) y haz clic en
   **Siguiente**.
3. **Paso 3.** Responde algunas preguntas. En una escribe una observación; en otra toca
   **Otro**, escribe una respuesta y elige un color. Haz clic en **Siguiente**.
4. **Paso 4.** Haz clic en **Agregar pregunta**, escribe una pregunta y deja la respuesta vacía.
   Haz clic en **Siguiente**.
5. **Paso 5.** Agrega una consulta del equipo y dos compromisos, uno con responsable "Equipo" y
   otro con "Tutores". Haz clic en **Guardar tutoría**.
6. **Paso 6.** Aparece el semáforo de las seis dimensiones: rojo si alguna respuesta de la
   dimensión es roja, amarillo si no hay rojas pero sí alguna amarilla, verde si todas son
   verdes, y "Sin dato" si no se respondió ninguna.
7. En la planilla:
   - `Tutorias` tiene una fila nueva con la `dupla` del equipo y los
     `integrantes_presentes`.
   - `Respuestas` tiene una fila por pregunta respondida, con `valor` (rojo = 1, amarillo = 2,
     verde = 3) y la `nota` que escribiste.
   - `PreguntasTutor` y `ConsultasEquipo` tienen una fila cada una, y `Compromisos` dos.
   - `SemaforoDimensiones` tiene seis filas de esa tutoría, con `es_ultima_del_equipo` en
     `TRUE` (o `VERDADERO`), y en `EstadoEquipos` el equipo tiene `tutorias` = 1.
8. Prueba también el caso sin dupla: en el paso 1 elige "No está en la lista" en uno de los dos
   menús y escribe un nombre. En el paso 2 debe aparecer el aviso de que no forman una dupla
   registrada, con todos los equipos.

Los pasos 4 y 5 se omiten con un clic: si no agregas nada, los botones dicen **Omitir este
paso** y **Omitir y guardar**.

### 8.3 Generar el acta con Gemini

1. En el paso 6, haz clic en **Generar acta**. Tarda unos segundos.
2. Aparece el cuadro "Observaciones generales de la reunión" con viñetas, y debajo dice
   "Redactado por gemini-…". Si en cambio dice que el texto salió de la plantilla sin IA,
   revisa la propiedad `CLAVE_API_GEMINI` (sección 4); el motivo queda en el editor, en
   **Executions** (en español, **Ejecuciones**; etiqueta no verificada en la documentación),
   en la ejecución de `generarActa`.
3. Revisa la vista previa: los integrantes presentes en "Información General", la observación
   junto a su respuesta y la pregunta del tutor en "Consultas y Respuestas", la consulta en
   "Consultas del Equipo" y los dos compromisos en "Compromisos". Edita el texto: la vista
   previa se actualiza mientras escribes.
4. Haz clic en **Aprobar acta**. En la pestaña `Actas` la fila queda con `estado` `aprobada`;
   en la carpeta `Copiloto de Tutorías - Actas` de Drive aparece el documento de Google, y en
   `SemaforoDimensiones` la tutoría pasa a `acta_estado` `aprobada`.

### 8.4 Descargar el .docx

1. Haz clic en **Descargar .docx**. Se descarga un archivo con nombre como
   `EL4030_Equipo2_Hito_1_2026-10-20.docx`. Ábrelo en Word o súbelo a Drive y revisa las seis
   secciones: Información General, Consultas y Respuestas, Observaciones Generales de la
   Reunión, Estado por Dimensión, Consultas del Equipo y Compromisos.
2. Repite la descarga con una cuenta de Google que **no** tenga acceso a la carpeta de actas
   (por ejemplo, la de un tutor): debe funcionar igual, porque el archivo lo prepara la app con
   los permisos de la cuenta de Impulsa. El botón "Abrir en Google Docs", en cambio, solo
   funciona para quien tenga acceso a la carpeta.

### 8.5 Panel de seguimiento

Sigue la sección 9.2. La tutoría de la comprobación 8.2 debe aparecer en la tarjeta "Tutorías
realizadas" y en la tabla de estado de los equipos. El informe de Data Studio
(`DATA_STUDIO.md`) es opcional.

Cuando termines las comprobaciones, borra a mano las filas de prueba de `Tutorias`,
`Respuestas`, `PreguntasTutor`, `ConsultasEquipo`, `Compromisos` y `Actas` (Sheets avisa
porque están protegidas) y usa **Copiloto > Recalcular tablas de análisis**.

---

## 9. Panel de seguimiento (tercera versión)

El Panel está dentro de la misma aplicación web: no hay que armar nada en Data Studio. Lo ve
cualquiera que abra la URL de la app, y no muestra nombres de estudiantes.

### 9.1 Volver a pegar los archivos y actualizar el despliegue

1. En esta versión cambiaron cuatro archivos de `src/`: `Codigo.gs`, `Index.html`,
   `Estilos.html` y `Cliente.html`. `Datos.gs` no cambió. Pega los cuatro (sección 6, paso 1).
2. No hay pestañas ni columnas nuevas ni permisos nuevos. Correr `configurarPlanilla` no hace
   falta, pero tampoco hace daño (sección 6, paso 2).
3. Actualiza el despliegue sin cambiar la URL: sección 6, pasos 3 a 6.

### 9.2 Probar el Panel

1. Abre la URL de la app (o recarga la página si ya estaba abierta). Arriba a la derecha
   aparecen dos botones: **Registro** (marcado) y **Panel**.
2. En **Registro**, avanza hasta el paso 2 y elige un equipo. Haz clic en **Panel**: aparece
   "Leyendo la planilla..." y después el panel. Vuelve a **Registro**: el registro sigue en el
   paso 2 con el mismo equipo elegido.
3. En el Panel, revisa:
   - Los filtros de semestre (con el más reciente elegido), curso, dupla e hito, y debajo la
     línea que explica que el estado actual es la última tutoría de cada equipo.
   - Las cuatro tarjetas: tutorías realizadas, equipos con rojo, sin tutoría en 14 días y actas
     aprobadas.
   - La tabla "Estado de los equipos", con los rojos primero. Toca el número de un equipo: se
     abre su historial, con el estado del acta y el enlace "Abrir acta" si está aprobada.
   - "Dónde están los problemas hoy", "Evolución semanal", "Duplas" y "Compromisos y
     consultas".
4. Elige un hito en el filtro: cambian la evolución, el historial y los compromisos y consultas,
   pero no las tarjetas ni el estado de los equipos.
5. Guarda una tutoría nueva en **Registro**, vuelve a **Panel** y haz clic en **Actualizar**:
   la tarjeta "Tutorías realizadas" sube en uno.
6. Ábrelo en un teléfono: las tarjetas quedan de dos en dos y las tablas se desplazan de lado
   dentro de su recuadro, con la primera columna fija.

Si el Panel dice que no se pudo cargar, revisa que las pestañas `Equipos`, `Tutorias`,
`Respuestas`, `Actas`, `Compromisos` y `ConsultasEquipo` existan (sección 3) y que hayas
actualizado el despliegue con una versión nueva (sección 6, pasos 3 a 6).

---

## Si algo falla

- **La planilla es el camino manual.** Si la app no responde, la tutoría se registra igual a
  mano en `Tutorias`, `Respuestas`, `PreguntasTutor`, `ConsultasEquipo` y `Compromisos`, con
  las mismas columnas y el mismo `id` de tutoría en `tutoria_id`. Después, usa
  **Copiloto > Recalcular tablas de análisis**.
- **Un tutor o un equipo no aparece en la página.** Revisa que su fila tenga `activo` vacío o
  `TRUE`, y que el equipo tenga `numero`, `nombre_proyecto` y `curso`. Recarga la página.
- **La página no encuentra la dupla.** En `Duplas`, `tutor_1` y `tutor_2` deben ser
  exactamente los `alias` de `Tutores` (las mayúsculas y las tildes no importan), y `activa`
  debe estar vacía o en `TRUE`. En `Equipos`, la columna `dupla` debe repetir el nombre de la
  columna `dupla` de `Duplas`.
- **Cuotas gratuitas.** Apps Script tiene límites diarios por cuenta (llamadas a servicios
  externos, tiempo de ejecución) que alcanzan de sobra para 13-14 tutores; el plan gratuito de
  Gemini también tiene límites, y cuando se agotan la app baja al siguiente modelo y, al
  final, a la plantilla sin IA.

## Fuentes (documentación oficial de Google)

1. Scripts ligados a una planilla (Extensions > Apps Script):
   https://developers.google.com/apps-script/guides/bound
   (en español: https://developers.google.com/apps-script/guides/bound?hl=es-419)
2. Proyectos de script, agregar archivos (Editor > Add):
   https://developers.google.com/apps-script/guides/projects
   (en español: https://developers.google.com/apps-script/guides/projects?hl=es-419)
3. Guardar, ejecutar y autorizar (Save, Run, Review permissions, Allow):
   https://developers.google.com/workspace/docs/api/quickstart/apps-script
   (en español: https://developers.google.com/workspace/docs/api/quickstart/apps-script?hl=es-419)
4. Advertencia de app no verificada (Advanced > Go to … (unsafe)):
   https://developers.google.com/apps-script/samples/automations/mail-merge
   (en español: https://developers.google.com/apps-script/samples/automations/mail-merge?hl=es-419)
5. Autorización y detección automática de permisos:
   https://developers.google.com/apps-script/guides/services/authorization
6. Propiedades del script (Project Settings > Script Properties):
   https://developers.google.com/apps-script/guides/properties
   (en español: https://developers.google.com/apps-script/guides/properties?hl=es-419)
7. Aplicaciones web (Deploy > New deployment > Web app, "Execute the app as me"):
   https://developers.google.com/apps-script/guides/web
   (en español: https://developers.google.com/apps-script/guides/web?hl=es-419)
8. Implementaciones y edición de una implementación:
   https://developers.google.com/apps-script/concepts/deployments
   (en español: https://developers.google.com/apps-script/concepts/deployments?hl=es-419)
9. Versiones (Version > New version):
   https://developers.google.com/apps-script/guides/versions
   (en español: https://developers.google.com/apps-script/guides/versions?hl=es-419)
10. Valores de acceso de una aplicación web (`ANYONE`: "Any logged-in user"):
    https://developers.google.com/apps-script/manifest/web-app-api-executable
11. Cuotas de Apps Script:
    https://developers.google.com/apps-script/guides/services/quotas
12. Importar un CSV en Sheets (**File > Import**, **Replace current sheet**,
    **Separator character**, **Import**):
    https://support.google.com/docs/answer/40608
    (en español: https://support.google.com/docs/answer/40608?hl=es-419)
13. Proteger hojas y rangos, con advertencia (**Data > Protect sheets and ranges**):
    https://support.google.com/docs/answer/1218656
    (en español: https://support.google.com/docs/answer/1218656?hl=es-419)
