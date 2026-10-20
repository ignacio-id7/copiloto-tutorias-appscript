# CLAUDE.md

Copiloto de Tutorías de Impulsa DIE (Universidad de Chile), versión sobre Google Apps Script y
Google Sheets. Reemplaza a la versión con Docker de `C:\Users\ignac\Proyectos\copiloto-tutorias`,
que queda en pausa: se lee como referencia de diseño (flujo, prompt, minuta, banco de
preguntas, identidad visual), pero no se modifica.

## Reglas del proyecto

Estas reglas no se relajan sin decisión explícita del usuario:

1. **Solo herramientas, APIs y nubes gratuitas.** Si algo requiere pago, se declara en vez de
   implementarlo y se propone la alternativa gratuita.
2. **Nada generado por Gemini queda como definitivo sin que un tutor lo revise**, lo edite si
   quiere y lo apruebe.
3. **No hace falta funcionar sin conexión.**
4. **La interfaz se diseña para computador (uso mayoritario) y para teléfono.**
5. **Los datos viven en la planilla.** La planilla es el camino manual: si la app falla,
   Impulsa sigue operando con ella.
6. **Ningún secreto en el código ni en git.** La clave de Gemini va en las propiedades del
   script, con la clave `CLAVE_API_GEMINI`.
7. **Código, nombres y comentarios en español; identificadores sin tildes.**
8. **El código lo instala el usuario copiándolo a mano** en el editor de Apps Script (ver
   abajo). Todo cambio futuro dice qué archivos de `src/` cambiaron, para que sepa cuáles
   volver a pegar.
9. **Los comandos que se le entregan al usuario van uno por bloque, en PowerShell y con rutas
   de Windows.**
10. **Los datos reales nunca entran a git.** `datos/` (CSV de tutores, duplas y equipos con
    nombres de estudiantes) está en `.gitignore`. Nunca se copian datos reales a `src/`,
    `pruebas/` ni a ningún archivo versionado; las pruebas usan datos ficticios.

## Forma de trabajo

Claude no se conecta a ninguna cuenta de Google ni usa clasp. Escribe el código aquí y el
usuario lo pega en el editor de Apps Script de una planilla de la cuenta de Impulsa
(`INSTALACION.md`). Por eso:

- Como máximo cinco archivos, en `src/`, con el mismo nombre que tienen en el editor:
  `Codigo.gs` (servidor), `Datos.gs` (banco de preguntas e hitos de ejemplo), `Index.html`,
  `Estilos.html` y `Cliente.html` (JavaScript del navegador, incluido desde `Index.html`).
- Sin manifiesto `appsscript.json`: la configuración de la aplicación web se elige al
  desplegar, y los permisos los detecta el editor a partir del código.
- Las funciones puras (dupla de dos tutores, equipos de la dupla, validación del registro,
  semáforo de peor caso y `valor`, tablas de análisis, armado del prompt, plantilla sin IA,
  cascada de modelos, estructura de la minuta, normalización de nombres) no tocan servicios de
  Google y tienen pruebas en `pruebas/`, que corren con:

  ```powershell
  node --test "pruebas/*.test.js"
  ```

  `Codigo.gs` y `Datos.gs` terminan con un `module.exports` protegido por
  `typeof module !== 'undefined'`: en Apps Script no existe `module` y la línea no hace nada;
  en Node permite que las pruebas los carguen.

## Arquitectura

- **Planilla**, tablas únicas (nunca una pestaña por dupla), encabezados en la fila 1. Se leen
  y escriben por nombre de columna, así que el orden de las columnas no importa:
  - De referencia, editables a mano: `Tutores` (alias, nombre, apellido, correo, activo),
    `Duplas` (semestre, dupla, tutor_1, tutor_2 por alias, activa), `Equipos` (semestre,
    numero, nombre_proyecto, curso, dupla, integrantes separados por coma, descripcion,
    activo), `Hitos` y `Preguntas`. Los tres primeros se importan desde los CSV de `datos/`.
  - Las escribe la app: `Tutorias`, `Respuestas` (con columnas de contexto y `valor`),
    `PreguntasTutor`, `ConsultasEquipo`, `Compromisos` y `Actas`. Todo como texto salvo los
    números, para que la planilla no convierta fechas ni lea un "=" como fórmula.
  - Para Data Studio, rehechas por el script en cada guardado y aprobación, y con el menú
    **Copiloto > Recalcular tablas de análisis**: `SemaforoDimensiones` (una fila por tutoría y
    dimensión, con `es_ultima_del_equipo`) y `EstadoEquipos` (una fila por equipo activo).
  - Las de la app y las de Data Studio quedan protegidas solo con advertencia.
  - `configurarPlanilla()` crea las pestañas y columnas que falten sin borrar ni pisar nada,
    siembra los hitos de ejemplo solo si `Hitos` está vacía y el banco por `clave`.
- **Activo.** `activo`/`activa` vacío cuenta como activo; solo `FALSE`, `FALSO`, `NO` o `0`
  desactivan (acepta también casillas de verificación).
- **Tutores y duplas.** El paso 1 elige tutores de `Tutores` (o los escribe a mano). La dupla se
  busca por alias, en cualquier orden, y el paso 2 muestra sus equipos activos; sin dupla
  registrada, todos con un aviso. La `dupla` que se guarda es siempre la del equipo, para que
  todas las tablas filtren igual por dupla.
- **Aplicación web** (HtmlService, se ejecuta como el propietario): el navegador llama al
  servidor con `google.script.run`. Las escrituras usan `LockService`.
- **Principio de copia.** `Tutorias`, `Respuestas`, `PreguntasTutor`, `ConsultasEquipo` y
  `Compromisos` guardan los textos tal como estaban al registrar; el acta se arma solo desde
  esa copia. Corregir una tutoría (antes de aprobar el acta) reemplaza su fila y sus filas
  hijas.
- **Semáforo** por dimensión con la regla de peor caso (rojo > amarillo > verde). Para Data
  Studio, `valor` rojo = 1, amarillo = 2, verde = 3: el peor caso es el mínimo
  (`DATA_STUDIO.md`).
- **Gemini** redacta solo "Observaciones generales", con el prompt de la versión anterior, por
  `UrlFetchApp`, en cascada: `gemini-3.5-flash`, `gemini-3.5-flash-lite`,
  `gemini-3.1-flash-lite` y, si todos fallan o no hay clave, la plantilla sin IA. Cuota (429)
  baja de modelo de inmediato; fallo transitorio (red, 5xx) reintenta el mismo con espera
  creciente; otro error baja sin reintentar. La rúbrica del curso no se envía en el prototipo.
- **Acta.** Al aprobar, se crea un documento de Google con la estructura de la minuta en la
  carpeta de Drive del propietario (`ID_CARPETA_ACTAS` en las propiedades del script, creada
  sola si falta). La descarga `.docx` la exporta el servidor con el permiso del propietario y
  la entrega al navegador, así que funciona para un tutor sin acceso a la carpeta.

## Seis dimensiones (fijas)

PRB problema y cliente · SOL solución y prototipo · VAL validación y aprendizaje · EQP equipo
y roles · GES gestión y ritmo · HIT preparación del hito.

## Data Studio

`DATA_STUDIO.md` es la guía para que el usuario arme el informe a mano. Lee `SemaforoDimensiones`,
`EstadoEquipos`, `Tutorias`, `Compromisos` y `ConsultasEquipo` con las credenciales del
propietario. Ningún panel muestra nombres de estudiantes (`integrantes_presentes` no se usa).
Si cambian las columnas de esas pestañas, se actualiza la guía.

## Fuera del prototipo

`.md` con front-matter, plantilla en blanco descargable, identificadores deterministas, aviso de
registros duplicados y envío de la rúbrica a Gemini.
