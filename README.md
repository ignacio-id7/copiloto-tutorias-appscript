# Copiloto de Tutorías

Aplicación web para registrar las tutorías de Impulsa DIE (Universidad de Chile) con los
equipos de emprendimiento y seguir su avance durante el semestre. Corre sobre Google Apps
Script y Google Sheets: la planilla guarda todos los datos y la app es una forma guiada de
llenarla.

## Flujo de uso

1. **Registro de la tutoría.** La dupla de tutores sigue seis pasos: quiénes hacen la tutoría,
   qué equipo y qué hito (con los integrantes presentes), cómo está el equipo según el banco de
   preguntas, qué más preguntaron, y las consultas del equipo y los compromisos.
2. **Semáforo de seis dimensiones.** Cada respuesta tiene un color, y cada dimensión toma el
   peor caso (rojo > amarillo > verde):

   | Código | Dimensión |
   | --- | --- |
   | PRB | Problema y cliente |
   | SOL | Solución y prototipo |
   | VAL | Validación y aprendizaje |
   | EQP | Equipo y roles |
   | GES | Gestión y ritmo |
   | HIT | Preparación del hito |

3. **Acta con revisión humana.** Gemini propone solo las "Observaciones generales". Nada
   generado por IA queda como definitivo: un tutor lo revisa, lo edita si quiere y aprueba el
   acta. Al aprobarla se crea un documento de Google con la estructura de la minuta, que se
   puede descargar como `.docx`.
4. **Panel de seguimiento.** En la misma app, el botón **Panel** muestra el estado actual de cada
   equipo (su última tutoría), los equipos sin tutoría en 14 días, la distribución de colores por
   dimensión, la evolución por semana, el resumen por dupla y los compromisos y consultas, con
   filtros por semestre, curso, dupla e hito. El panel no muestra nombres de estudiantes.

Las tutorías se eliminan solo desde la planilla, con **Copiloto > Eliminar tutorías…**. El
código nunca borra nada en Google Drive: los documentos de las actas se borran a mano.

## Arquitectura

- **Google Apps Script** (HtmlService): sirve la aplicación web y ejecuta el servidor
  (`src/Codigo.gs`). El navegador lo llama con `google.script.run`, y las escrituras se
  serializan con `LockService`.
- **Google Sheets**: una tabla por tipo de dato (tutores, duplas, equipos, hitos, preguntas,
  tutorías, respuestas, compromisos, actas y otras), leídas y escritas por nombre de columna. Si
  la app falla, Impulsa sigue operando con la planilla a mano.
- **Gemini en cascada**: el script prueba varios modelos de Gemini, uno tras otro, por
  `UrlFetchApp`. Si se acaba la cuota baja al siguiente modelo, y si hay un fallo transitorio
  reintenta. Si ningún modelo responde o no hay clave configurada, usa una plantilla sin IA, así
  que el acta siempre se puede armar.
- **Google Docs y Drive**: las actas aprobadas quedan en una carpeta del propietario del script.
- **Data Studio** (opcional): `DATA_STUDIO.md` explica cómo armar gráficos propios a partir de las
  tablas de análisis que rehace el script.

| Ruta | Contenido |
| --- | --- |
| `src/` | Código que se sube a Apps Script: servidor, datos de ejemplo, páginas HTML y manifiesto |
| `pruebas/` | Pruebas de las funciones puras, con datos ficticios |
| `INSTALACION.md` | Instalación y actualización paso a paso |
| `DATA_STUDIO.md` | Guía opcional para Data Studio |

## Solo herramientas gratuitas

Todo corre en servicios sin costo: Google Apps Script, Google Sheets, Google Docs y Drive, la
capa gratuita de la API de Gemini y, si se usa, Data Studio. No hay servidor propio ni base de
datos aparte. La clave de Gemini va en las propiedades del script, nunca en el código.

## Pruebas

Las funciones que no usan servicios de Google (semáforo, tablas de análisis, panel, armado del
prompt, cascada de modelos, estructura del acta, eliminación de tutorías, entre otras) tienen
pruebas en Node.js, sin dependencias:

```powershell
node --test "pruebas/*.test.js"
```

## Instalación

La instalación y las actualizaciones están en [INSTALACION.md](INSTALACION.md): crear la planilla
y el proyecto de Apps Script, subir el código con clasp (o pegarlo a mano), configurar la clave
de Gemini y desplegar la aplicación web.

## Versión anterior

Esta versión reemplaza a la anterior del Copiloto, que corría con Docker. Esa versión queda en
pausa en un repositorio aparte, privado.
