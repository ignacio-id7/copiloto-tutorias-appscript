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

## Forma de trabajo

Claude no se conecta a ninguna cuenta de Google ni usa clasp. Escribe el código aquí y el
usuario lo pega en el editor de Apps Script de una planilla de la cuenta de Impulsa
(`INSTALACION.md`). Por eso:

- Como máximo cinco archivos, en `src/`, con el mismo nombre que tienen en el editor:
  `Codigo.gs` (servidor), `Datos.gs` (banco de preguntas y datos de ejemplo), `Index.html`,
  `Estilos.html` y `Cliente.html` (JavaScript del navegador, incluido desde `Index.html`).
- Sin manifiesto `appsscript.json`: la configuración de la aplicación web se elige al
  desplegar, y los permisos los detecta el editor a partir del código.
- Las funciones puras (semáforo de peor caso, armado del prompt, plantilla sin IA, cascada de
  modelos, estructura de la minuta, normalización de nombres) no tocan servicios de Google y
  tienen pruebas en `pruebas/`, que corren con:

  ```powershell
  node --test "pruebas/*.test.js"
  ```

  `Codigo.gs` y `Datos.gs` terminan con un `module.exports` protegido por
  `typeof module !== 'undefined'`: en Apps Script no existe `module` y la línea no hace nada;
  en Node permite que las pruebas los carguen.

## Arquitectura

- **Planilla** (una pestaña por entidad, encabezados en la fila 1): `Equipos`, `Hitos`,
  `Preguntas`, `Tutorias`, `Respuestas`, `Actas`. `configurarPlanilla()` las crea y siembra
  equipos, hitos y banco sin duplicar ni pisar lo que ya esté (clave: semestre + número para
  equipos, semestre + curso + número para hitos, `clave` para preguntas).
- **Aplicación web** (HtmlService, se ejecuta como el propietario): el navegador llama al
  servidor con `google.script.run`. Las escrituras usan `LockService`.
- **Principio de copia.** `Tutorias` y `Respuestas` guardan el texto de equipo, hito, pregunta
  y alternativa tal como estaban al registrar; el acta se arma solo desde esa copia.
- **Semáforo** por dimensión con la regla de peor caso (rojo > amarillo > verde). No se
  guarda: se calcula desde `Respuestas`.
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

## Fuera del prototipo

Preguntas del tutor, consultas del equipo, compromisos, integrantes presentes, nota por
pregunta, `.md` con front-matter, plantilla en blanco descargable, identificadores
deterministas y aviso de registros duplicados. Las funciones puras ya aceptan preguntas del
tutor, consultas y compromisos (vacíos), para que agregarlos no cambie el prompt ni la minuta.
