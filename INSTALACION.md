# Instalación del Copiloto de Tutorías (prototipo)

Guía para instalar la aplicación en la cuenta de Google de Impulsa, sin experiencia previa en
Apps Script. Se hace una sola vez; la sección 6 explica cómo actualizar el código después.

Necesitas:

- La cuenta de Google de Impulsa (no una cuenta personal: la app y las actas quedan en el
  Drive de esa cuenta).
- Una clave de la API de Gemini creada con esa misma cuenta, en
  [Google AI Studio](https://aistudio.google.com/apikey) (gratuita).
- Los cinco archivos de la carpeta `src/` de este repositorio, abiertos en un editor de texto
  (el Bloc de notas sirve) para copiar su contenido.

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
6. Espera a que termine. Abajo aparece el registro de ejecución con el mensaje
   `Planilla lista. Filas nuevas: 2 equipos, 4 hitos, 64 preguntas.`
7. Vuelve a la pestaña de la planilla: ahora tiene las pestañas `Equipos`, `Hitos`,
   `Preguntas`, `Tutorias`, `Respuestas` y `Actas`. En tu Drive apareció la carpeta
   `Copiloto de Tutorías - Actas`.

`configurarPlanilla` se puede correr de nuevo cuando quieras: no duplica filas ni pisa lo que
ya esté en la planilla. Al reabrir la planilla aparece además un menú **Copiloto >
Configurar planilla** que hace lo mismo.

Los equipos y los hitos que se cargan son **datos ficticios de ejemplo**. Los reales del
semestre se escriben directo en las pestañas `Equipos` e `Hitos`, una fila por equipo o hito,
con las mismas columnas. En `Preguntas`, escribir `NO` en la columna `activa` retira una
pregunta del guion; `hito_numero` vacío significa "todos los hitos" y el Examen es el hito 4.

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
2. Si cambió `Codigo.gs` o `Datos.gs` y el aviso lo indica, corre `configurarPlanilla` otra vez
   (paso 3.1 y 3.2).
3. Haz clic en **Deploy > Manage deployments** (en español, **Implementar > Administrar
   implementaciones**).
4. Selecciona la implementación activa y haz clic en **Edit** (el lápiz; en español,
   **Editar**).
5. En la sección **Version** (en español, **Versión**), elige **New version** (en español,
   **Versión nueva**).
6. Haz clic en **Deploy** (en español, **Implementar**).

La URL queda igual. No uses **New deployment** para actualizar: crea una URL distinta.

---

## 7. Comprobaciones del prototipo

Haz las cuatro en orden, con la URL del paso 5.

### 7.1 Abrir la página

1. Abre la URL en el computador. Si no tienes sesión iniciada, Google la pide.
2. Debe aparecer "Copiloto de Tutorías" con el fondo oscuro de Impulsa, la tipografía Outfit,
   el chip "Semestre 2026-2" y el paso 1, "¿Quiénes hacen la tutoría?".
3. Ábrela también en un teléfono: el panel de pasos de la izquierda se reemplaza por "Paso 1
   de 4" y una barra de avance.

Si dice que no se pudieron leer los datos de la planilla, revisa que hayas corrido
`configurarPlanilla` (sección 3).

### 7.2 Guardar una tutoría y verla en la planilla

1. Escribe nombre y apellido de dos tutores distintos y haz clic en **Siguiente**.
2. Elige el **Equipo 2** (Kits de robótica accesibles). El hito viene preseleccionado según
   la fecha; elige **Hito 1** y haz clic en **Siguiente**.
3. Responde algunas preguntas tocando una alternativa. En una de ellas toca **Otro**, escribe
   una respuesta y elige un color.
4. Haz clic en **Guardar tutoría**. Aparece el semáforo de las seis dimensiones: rojo si
   alguna respuesta de la dimensión es roja, amarillo si no hay rojas pero sí alguna
   amarilla, verde si todas son verdes, y "Sin dato" si no se respondió ninguna.
5. En la planilla: la pestaña `Tutorias` tiene una fila nueva con los tutores, el equipo y el
   hito; la pestaña `Respuestas` tiene una fila por pregunta respondida, y la de "Otro" dice
   `SI` en `respuesta_propia`.

### 7.3 Generar el acta con Gemini

1. En la misma página, haz clic en **Generar acta**. Tarda unos segundos.
2. Aparece el cuadro "Observaciones generales de la reunión" con viñetas, y debajo dice
   "Redactado por gemini-…". Si en cambio dice que el texto salió de la plantilla sin IA,
   revisa la propiedad `CLAVE_API_GEMINI` (sección 4); el motivo queda en el editor, en
   **Executions** (en español, **Ejecuciones**; etiqueta no verificada en la documentación),
   en la ejecución de `generarActa`.
3. Edita el texto: la vista previa del acta, a la derecha (abajo en el teléfono), se actualiza
   mientras escribes.
4. Haz clic en **Aprobar acta**. En la pestaña `Actas` de la planilla la fila queda con
   `estado` `aprobada`, y en la carpeta `Copiloto de Tutorías - Actas` de Drive aparece un
   documento de Google con la estructura de la minuta.

### 7.4 Descargar el .docx

1. Haz clic en **Descargar .docx**. Se descarga un archivo con nombre como
   `EL4030_Equipo2_Hito_1_2026-10-20.docx`. Ábrelo en Word o súbelo a Drive y revisa las seis
   secciones: Información General, Consultas y Respuestas, Observaciones Generales de la
   Reunión, Estado por Dimensión, Consultas del Equipo y Compromisos.
2. Repite la descarga con una cuenta de Google que **no** tenga acceso a la carpeta de actas
   (por ejemplo, la de un tutor): debe funcionar igual, porque el archivo lo prepara la app con
   los permisos de la cuenta de Impulsa. El botón "Abrir en Google Docs", en cambio, solo
   funciona para quien tenga acceso a la carpeta.

---

## Si algo falla

- **La planilla es el camino manual.** Si la app no responde, la tutoría se registra igual a
  mano en las pestañas `Tutorias` y `Respuestas`, con las mismas columnas.
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
