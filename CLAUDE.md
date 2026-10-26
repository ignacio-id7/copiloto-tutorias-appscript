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
8. **Despliegue (T-14 del portal, igual que su T-10).** Claude Code puede ejecutar solo estos
   comandos de clasp, y siempre pide permiso antes de cada uno:
   - `clasp push`.
   - `clasp push --force`, solo si clasp pide confirmar el reemplazo del manifiesto, y después de
     mostrarle al usuario la diferencia de `src/appsscript.json`.
   - `clasp list-deployments`, `clasp update-deployment <id>` y `clasp show-authorized-user`.
   - `clasp logout`. Cuando el usuario dice que terminamos por hoy, Claude Code ejecuta
     `clasp logout` y después `clasp show-authorized-user` para confirmar que no quedó sesión.

   Nunca ejecuta `clasp login`, `clasp pull` ni ningún otro comando u opción de clasp, y nunca lee
   ningún `.clasprc.json`. Si clasp dice que no hay credenciales, se detiene y le pide al usuario
   que ejecute `clasp login` en PowerShell. Las reglas están también en `.claude/settings.json`.
   Todo cambio dice qué archivos de `src/` cambiaron.
9. **Los comandos que se le entregan al usuario van uno por bloque, en PowerShell y con rutas
   de Windows.**
10. **Los datos reales nunca entran a git.** `datos/` (CSV de tutores, duplas y equipos con
    nombres de estudiantes) está en `.gitignore`. Nunca se copian datos reales a `src/`,
    `pruebas/` ni a ningún archivo versionado; las pruebas usan datos ficticios.
11. **El código no borra nada en el Drive** (igual que R-14 del portal): no envía a la papelera,
    no elimina y no quita permisos. Lo que haya que borrar en el Drive se borra a mano.
    `pruebas/sin_borrados_drive.test.js` revisa `src/` y falla si aparece `setTrashed`,
    `removeFile`, `removeFolder`, `Drive.Files` o `Drive.Permissions` con `remove` o `delete`,
    `removeEditor`, `removeViewer` o `revokePermissions`.

## Forma de trabajo

Claude no se conecta a ninguna cuenta de Google. El usuario abre la sesión de clasp con la
cuenta de Impulsa en su PowerShell, y Claude Code sube `src/` con los comandos de la regla 8
(`INSTALACION.md`, secciones 0 y 6). Pegar a mano en el editor queda como camino alternativo.
`clasp push` reemplaza todo el proyecto en línea, así que nada se edita directamente en el
editor. Por eso:

- En `src/`, con el mismo nombre que tienen en el editor, seis archivos de código: `Codigo.gs`
  (servidor), `Datos.gs` (banco de preguntas e hitos de ejemplo), `Index.html`, `Estilos.html`,
  `Cliente.html` (JavaScript del navegador, incluido desde `Index.html`) y `Eliminar.html` (el
  diálogo de la planilla para eliminar tutorías), más el manifiesto.
  `.clasp.json` (en `.gitignore`) sube solo `.gs`, `.html` y `.json` desde `src/`.
- El manifiesto `src/appsscript.json` se copió tal cual del editor, sin inventarlo: zona horaria
  `America/Santiago`, V8 y la aplicación web ejecutada como quien la despliega (`USER_DEPLOYING`)
  con acceso `ANYONE`. Esos valores no se cambian sin decisión del usuario. Los permisos los
  sigue detectando el editor a partir del código.
- Las funciones puras (dupla de dos tutores, equipos de la dupla, validación del registro,
  semáforo de peor caso y `valor`, tablas de análisis, panel y semana ISO, armado del prompt,
  plantilla sin IA, cascada de modelos, estructura de la minuta, normalización de nombres, lista y
  plan para eliminar tutorías) no tocan servicios de
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

## Panel

El seguimiento diario está en la misma aplicación web: la cabecera tiene dos botones,
**Registro** y **Panel** (`aria-pressed`). Cambiar de vista solo oculta la otra, así que un
registro en curso no se pierde. El panel se carga al entrar por primera vez y con **Actualizar**.

- **Lo ve cualquiera que abra la app** (decisión del usuario): no hay control de acceso aparte
  del despliegue.
- **Ningún dato de estudiantes sale del servidor.** `armarPanel` copia campo por campo lo que
  entrega: nunca `integrantes` de `Equipos` ni `integrantes_presentes` de `Tutorias`. Hay una
  prueba que recorre toda la salida. Cualquier campo nuevo del panel se agrega a mano a esa
  copia, nunca pasando filas completas.
- **Servidor.** `obtenerPanel()` lee `Equipos`, `Tutorias`, `Respuestas`, `Actas`,
  `Compromisos` y `ConsultasEquipo` y llama a la función pura `armarPanel(datos, hoy)`, que
  calcula en el momento con `filasSemaforoDimensiones` y `filasEstadoEquipos` (hoy en Chile).
  No depende de que `SemaforoDimensiones` y `EstadoEquipos` estén recalculadas. Entrega todo de
  una vez: equipos activos con su estado actual, tutorías (con semana ISO, estado del acta y
  enlace si está aprobada), compromisos y consultas con el contexto de su tutoría.
- **Filtros en el navegador** (semestre, por defecto el más reciente; curso; dupla; hito). Los
  aplica `resumirPanel(panel, filtros)`, función pura de `Codigo.gs` que `Index.html` incluye en
  la página con `codigoCompartidoPanel()` (su código fuente): el navegador ejecuta la misma
  función que prueban las pruebas, así que no puede usar nada de fuera de su cuerpo.
- **Estado actual = última tutoría de cada equipo**, sin importar el hito. El filtro de hito
  solo cambia la evolución semanal, el historial del equipo y los compromisos y consultas; la
  página lo dice en una línea.
- **Contenido:** tarjetas (tutorías realizadas, equipos con rojo en su última tutoría, equipos
  sin tutoría en 14 días incluidos los que no tienen ninguna, actas aprobadas sobre el total);
  tabla de estado (rojos primero, después más días sin tutoría; ordenable; al tocar un equipo,
  su historial, compromisos y consultas); barras apiladas por dimensión con los equipos en cada
  color hoy; evolución por semana ISO al 100 % (las sin dato no cuentan; rótulo "Sem. 12 oct");
  tabla de duplas (la dupla del equipo); compromisos y consultas con búsqueda.
- Gráficos con CSS, sin librerías. Colores del semáforo solo con `--color-verde`,
  `--color-amarillo`, `--color-rojo` y `--color-gris`; cada celda de color lleva también la
  inicial o el texto. Todo texto de la planilla pasa por `escapar`. En el teléfono, tarjetas de
  dos en dos y tablas con desplazamiento horizontal propio y la primera columna fija.

## Eliminar tutorías

Solo en la planilla, nunca en la aplicación web: menú **Copiloto > Eliminar tutorías…**, que abre
el diálogo modal `Eliminar.html`. El Panel lo ve cualquiera; eliminar queda para quien edita la
planilla.

- **Permiso del diálogo.** Toda función global se puede llamar con `google.script.run`, también
  desde la aplicación web. Por eso `abrirEliminarTutorias` guarda en `CacheService` un permiso al
  azar (dura una hora) y lo pasa al diálogo; `obtenerTutoriasParaEliminar` y `eliminarTutorias`
  no hacen nada sin él. Cualquier función nueva que borre, o que lea para borrar, lo exige igual.
- **Lista** (`listarTutoriasParaEliminar`, pura): más recientes primero, con fecha, semestre,
  curso, equipo, proyecto, hito, dupla, `registrada_en` y estado del acta, copiada campo por campo
  (nunca `integrantes_presentes`). En el navegador: casillas, filtro por fecha de registro y
  confirmación con cuántas tutorías y cuántas actas aprobadas se eliminan.
- **Servidor** (`eliminarTutorias`, con `conBloqueo`): lee una vez `Tutorias`,
  `PESTANAS_DE_LA_TUTORIA` y `Actas`; `planEliminarTutorias` (pura) dice qué filas borrar en cada
  una y qué documentos quedan; `borrarNumerosDeFila` (la misma que usa `borrarFilasDeTutoria`)
  las borra de abajo hacia arriba, y al final hay una sola llamada a `recalcularSinBloqueo`. Un id
  que no está en `Tutorias` no borra nada.
- **Drive** (regla 11): los documentos de las actas aprobadas no se tocan. El diálogo final los
  lista con su enlace para borrarlos a mano desde la carpeta de actas.

## Data Studio (opcional)

El seguimiento diario ya está en el Panel. `DATA_STUDIO.md` queda como guía opcional para quien
quiera armar gráficos propios en Data Studio. Lee `SemaforoDimensiones`,
`EstadoEquipos`, `Tutorias`, `Compromisos` y `ConsultasEquipo` con las credenciales del
propietario. Ningún panel muestra nombres de estudiantes (`integrantes_presentes` no se usa).
Si cambian las columnas de esas pestañas, se actualiza la guía.

## Fuera del prototipo

`.md` con front-matter, plantilla en blanco descargable, identificadores deterministas, aviso de
registros duplicados y envío de la rúbrica a Gemini.

## Buzón con el arquitecto

- El buzón de este proyecto es `C:\Users\ignac\Proyectos\impulsa-contexto\orquestacion\copiloto\`. El protocolo completo está en `C:\Users\ignac\Proyectos\impulsa-contexto\orquestacion\LEEME.md`; lo esencial está en esta sección.
- Cuando el usuario escribe "sigue", lee `encargo.md`. Si su estado es "pendiente", cámbialo a "en curso" y ejecútalo con las reglas de este archivo. Los permisos de clasp se piden igual que siempre.
- Al terminar o al quedar bloqueado, escribe `informe.md` con: número del encargo, estado (hecho o bloqueado), qué hiciste, archivos cambiados (y cuáles de `src/`), pruebas y su resultado, comandos ejecutados, pendientes y preguntas para el arquitecto. Agrega el mismo informe al final de `historial.md` y deja `encargo.md` en "hecho" o "bloqueado".
- En el buzón no se escriben nombres de personas ni de estudiantes, correos, claves, IDs de planillas o scripts, ni nada de `datos/`.
- Fuera de su buzón, Claude Code no escribe nada en `impulsa-contexto`.
