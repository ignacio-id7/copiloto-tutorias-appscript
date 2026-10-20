# Panel de seguimiento en Data Studio

Guía para armar a mano, con la cuenta de Google de Impulsa, el informe que muestra el estado de
los equipos a partir de la planilla del Copiloto. Data Studio (antes Looker Studio) es la
herramienta gratuita de paneles de Google; entra en <https://datastudio.google.com>.

Antes de empezar:

- La planilla tiene que tener al menos una tutoría guardada, y las pestañas
  `SemaforoDimensiones` y `EstadoEquipos` con filas. Si están vacías, en la planilla usa
  **Copiloto > Recalcular tablas de análisis**.
- Estas dos pestañas las rehace el script en cada guardado y cada vez que se aprueba un acta. No
  se editan a mano.

**Sobre los nombres de los menús.** Están en inglés, tal como aparecen en la documentación
oficial de Data Studio (enlaces al final). Si tu Data Studio está en español, los rótulos se
ven traducidos; esas traducciones no se pudieron verificar en la documentación. Lo que no
aparece en la documentación está marcado como **(no verificado)**.

**Cómo se lee el semáforo en los paneles.** Cada dimensión de cada tutoría tiene un `color`
(`rojo`, `amarillo`, `verde` o `sin dato`) y un `valor` numérico: rojo = 1, amarillo = 2,
verde = 3, vacío si no hay dato. El peor caso de varias filas es el **mínimo** de `valor`.

---

## Paso 1. Crear las cinco fuentes de datos

Se crea una fuente por pestaña: `SemaforoDimensiones`, `EstadoEquipos`, `Tutorias`,
`Compromisos` y `ConsultasEquipo`. Para cada una:

1. En la página de inicio de Data Studio, haz clic en el ícono **Create** (arriba a la
   izquierda) y elige **Data Source**.
2. Elige el conector **Google Sheets**.
3. En **Spreadsheet**, elige la planilla `Copiloto de Tutorías`; en **Worksheet**, la pestaña.
4. Deja marcada **Use first row as headers** y **Include hidden and filtered cells**.
5. Antes de conectar, haz clic en **Data credentials** y elige **Owner's Credentials**. Así,
   quien solo ve el informe lo ve con el permiso de la cuenta de Impulsa y no necesita acceso a
   la planilla. Guarda la elección.
6. Haz clic en **CONNECT** (arriba a la derecha). Se abre la lista de campos de la fuente.
7. Revisa los tipos de los campos, en la columna de tipo de esa lista:
   - En `SemaforoDimensiones`, `fecha` debe ser de tipo fecha (**Date**). En `EstadoEquipos`,
     `ultima_fecha` también.
   - `valor`, `equipo_numero`, `hito_numero`, `tutorias`, `dias_desde_ultima` y `peor_valor`
     deben ser números (**Number**).
   - El resto, texto.
   Si alguno quedó con otro tipo, cámbialo en esa misma lista.
8. Cambia el nombre de la fuente (arriba a la izquierda) por el de la pestaña, para
   reconocerla después (no verificado: el lugar exacto donde se edita el nombre).

Repite los pasos 1 a 8 con las cinco pestañas. Ninguna fuente necesita la columna
`integrantes_presentes` de `Tutorias`: no la uses en ningún gráfico (paso 9).

## Paso 2. Crear los campos calculados del semáforo

Los campos calculados se agregan en la fuente de datos, para usarlos en cualquier gráfico.
Para cada uno: abre la fuente, haz clic en **ADD A FIELD**, elige **Add calculated field**,
escribe el **Name** y la **Formula** de la tabla, y haz clic en **SAVE**.

En la fuente `SemaforoDimensiones`:

| Name | Formula | Para qué |
| --- | --- | --- |
| `Peor valor` | `MIN(valor)` | El peor caso del grupo que muestre el gráfico. |
| `Color peor caso` | `CASE WHEN MIN(valor) = 1 THEN "rojo" WHEN MIN(valor) = 2 THEN "amarillo" WHEN MIN(valor) = 3 THEN "verde" ELSE "sin dato" END` | Vuelve a escribir el peor caso como color (ver la nota de abajo). |
| `Valor promedio` | `AVG(valor)` | Promedio por dimensión (las filas sin dato no cuentan). |
| `Tutorías realizadas` | `SUM(CASE WHEN dimension = "PRB" THEN 1 ELSE 0 END)` | Cada tutoría tiene exactamente una fila PRB. |
| `Actas aprobadas` | `SUM(CASE WHEN dimension = "PRB" AND acta_estado = "aprobada" THEN 1 ELSE 0 END)` | Tutorías con acta aprobada. |
| `Dimensiones con dato` | `SUM(CASE WHEN color = "sin dato" THEN 0 ELSE 1 END)` | Base para contar colores y porcentajes. |
| `Dimensiones en rojo` | `SUM(CASE WHEN color = "rojo" THEN 1 ELSE 0 END)` | |
| `% en rojo` | `SUM(CASE WHEN color = "rojo" THEN 1 ELSE 0 END) / SUM(CASE WHEN color = "sin dato" THEN 0 ELSE 1 END)` | Después de guardarlo, cambia su tipo a porcentaje (**Percent**). |

**Nota sobre `Color peor caso` (no verificado).** La documentación de `CASE` no dice si acepta
funciones de agregación como `MIN(valor)` dentro de la condición. Si Data Studio rechaza la
fórmula, usa `Peor valor` en su lugar y colorea con formato condicional (paso 4.6): 1 = rojo,
2 = amarillo, 3 = verde.

En la fuente `EstadoEquipos`:

| Name | Formula | Para qué |
| --- | --- | --- |
| `Equipos con rojo` | `SUM(CASE WHEN peor_color = "rojo" THEN 1 ELSE 0 END)` | Equipos con alguna dimensión en rojo en su última tutoría. |
| `Sin tutoría reciente` | `SUM(CASE WHEN IFNULL(DATE_DIFF(TODAY(), ultima_fecha), 999) >= 14 THEN 1 ELSE 0 END)` | Equipos sin tutoría en los últimos 14 días, incluidos los que no tienen ninguna. |

**Nota sobre `Sin tutoría reciente` (no verificado).** La documentación dice que `DATE_DIFF`
admite solo fechas "en modo de compatibilidad" y recomienda `DATETIME_DIFF` para las fechas
nuevas. Si la fórmula da error, prueba con
`SUM(CASE WHEN IFNULL(DATETIME_DIFF(TODAY(), ultima_fecha, DAY), 999) >= 14 THEN 1 ELSE 0 END)`.
Si tampoco funciona, usa la columna `dias_desde_ultima`, que calcula el script:
`SUM(CASE WHEN IFNULL(dias_desde_ultima, 999) >= 14 THEN 1 ELSE 0 END)`. Esa columna se
actualiza en cada guardado y con **Copiloto > Recalcular tablas de análisis**, no todos los
días.

## Paso 3. Crear el informe y unir los filtros

1. Abre la fuente `SemaforoDimensiones` y haz clic en **CREATE REPORT** y luego en
   **ADD TO REPORT**.
2. Agrega al informe las otras cuatro fuentes (no verificado: el menú **Resource > Manage
   added data sources** y el botón para agregar una fuente).
3. Ponle de nombre al informe `Copiloto de Tutorías: seguimiento`.
4. Los filtros de una página solo afectan a los gráficos cuya fuente tiene un campo con el
   mismo **ID**, y los campos de fuentes distintas pueden tener ID distintos aunque se llamen
   igual. Para que los filtros de semestre, curso, dupla e hito sirvan en todas las fuentes, en
   el menú **Resource > Manage field names and IDs**:
   1. Haz clic en **Add field override**.
   2. En **Select a field**, elige `semestre` de `SemaforoDimensiones` y en **New ID** escribe
      `semestre`.
   3. Repite con `semestre` de `EstadoEquipos` y de `Tutorias`, con el mismo **New ID**
      `semestre`.
   4. Haz lo mismo con `curso` y `dupla` (en las tres fuentes) y con `hito_nombre` (en
      `SemaforoDimensiones` y `Tutorias`), con los ID `curso`, `dupla` y `hito_nombre`.

   `EstadoEquipos` no tiene hito, porque es el estado actual de cada equipo: el filtro de hito
   no la cambia.

## Paso 4. Página "Portafolio"

Para agregar un gráfico: con el informe en edición, usa **Add a chart** en la barra de
herramientas y elige el tipo (no verificado: la documentación de cada gráfico no da la ruta del
menú). Cada gráfico se configura en el panel **Properties**, pestaña **Setup**.

1. Cambia el nombre de la primera página a `Portafolio` (no verificado: el menú para nombrar
   páginas no está en la documentación revisada).
2. **Tarjeta "Tutorías realizadas":** gráfico de tipo **Scorecard** con la fuente
   `SemaforoDimensiones`; en la métrica elige `Tutorías realizadas`.
3. **Tarjeta "Equipos con rojo hoy":** **Scorecard** con la fuente `EstadoEquipos` y la métrica
   `Equipos con rojo`.
4. **Tarjeta "Sin tutoría en 14 días":** **Scorecard** con la fuente `EstadoEquipos` y la
   métrica `Sin tutoría reciente`.
5. **Tarjeta "Actas aprobadas":** **Scorecard** con la fuente `SemaforoDimensiones` y la métrica
   `Actas aprobadas`.
6. **Tabla de equipos por dimensión:** gráfico **Table** con la fuente `EstadoEquipos`.
   - Dimensiones, en este orden: `equipo_numero`, `equipo_proyecto`, `dupla`, `curso`,
     `ultima_fecha`, `color_prb`, `color_sol`, `color_val`, `color_eqp`, `color_ges`,
     `color_hit` y `peor_color`.
   - Formato condicional: en la pestaña **STYLE**, sección **Conditional formatting**, haz clic
     en **+ Add formatting**. En **Color type** elige **Single color**. En **Format rules**,
     en **Select a field** elige **Select any field**, en **Select a condition** elige
     **Equal to** y en **Input value** escribe `rojo`. En **Color and style** elige formatear la
     celda (no la fila entera) y un fondo rojo. Haz clic en **Save**.
   - Repite con `amarillo` (fondo amarillo) y `verde` (fondo verde).
7. **Filtros:** con **Add a control** en la barra de herramientas, agrega cuatro listas
   desplegables (no verificado: el nombre del tipo de control) y, en **Control field**, elige
   `semestre`, `curso`, `dupla` y `hito_nombre` (de `SemaforoDimensiones`).
8. Para que los filtros sigan en las demás páginas, selecciona cada control y usa
   **Arrange > Make Report-level**.

## Paso 5. Página "Evolución"

1. Agrega una página nueva y llámala `Evolución` (no verificado: el menú para agregar páginas).
2. **Valor promedio por dimensión por semana:** gráfico de serie de tiempo con la fuente
   `SemaforoDimensiones`.
   - Dimensión: `fecha`. Pasa el cursor sobre `fecha`, haz clic en el ícono **Edit** y elige el
     tipo **ISO Year Week**.
   - Dimensión de desglose: `dimension` (una línea por dimensión; no verificado: el nombre del
     campo de desglose en el panel).
   - Métrica: `Valor promedio`. 3 es todo verde y 1 es todo rojo.
3. **Distribución de colores por hito:** gráfico de barras apiladas con la fuente
   `SemaforoDimensiones`.
   - Dimensión: `hito_nombre`. Desglose: `color`.
   - Métrica: `Dimensiones con dato`. Las filas `sin dato` suman cero.

## Paso 6. Página "Duplas"

1. Agrega una página y llámala `Duplas`.
2. **Tutorías por dupla:** gráfico de barras con la fuente `Tutorias`; dimensión `dupla` y
   métrica de conteo de filas (**Record Count**; no verificado: el nombre de esta métrica en la
   documentación revisada).
3. **Porcentaje de dimensiones en rojo por dupla:** gráfico de barras con la fuente
   `SemaforoDimensiones`; dimensión `dupla` y métrica `% en rojo`.

La `dupla` de cada tutoría es la del equipo, no la de los tutores que la hicieron. Si una dupla
cubrió un equipo de otra, la tutoría cuenta para la dupla del equipo.

## Paso 7. Página "Compromisos y consultas"

`Compromisos` y `ConsultasEquipo` solo tienen el texto y el `tutoria_id`; el equipo, la dupla y
el hito están en `Tutorias`. Para filtrar por ellos se combinan las dos fuentes:

1. Agrega una página y llámala `Compromisos y consultas`.
2. Agrega un gráfico **Table**. En el panel **Properties**, bajo **Data source**, haz clic en
   **+BLEND DATA**.
3. En la primera tabla del editor de combinaciones, usa la fuente `Compromisos` con las
   dimensiones `tutoria_id`, `descripcion` y `responsable`.
4. Haz clic en **Join another table** y elige `Tutorias`, con las dimensiones `id`, `fecha`,
   `semestre`, `curso`, `dupla`, `equipo_numero`, `equipo_proyecto` y `hito_nombre`. **No**
   agregues `integrantes_presentes`.
5. Haz clic en el cuadro de configuración entre las dos tablas, elige la unión por la izquierda
   (no verificado: la documentación no nombra los operadores de unión), y como condición
   `tutoria_id` = `id`. Haz clic en **Save**.
6. En la tabla, usa como dimensiones `fecha`, `equipo_numero`, `equipo_proyecto`, `dupla`,
   `hito_nombre`, `descripcion` y `responsable`.
7. Repite los pasos 2 a 6 con `ConsultasEquipo` (dimensiones `tutoria_id`, `pregunta_equipo` y
   `respuesta_tutor`) en lugar de `Compromisos`.
8. Los filtros de nivel de informe del paso 4.8 ya aparecen en esta página. Para que filtren
   estas tablas, repite el paso 3.4 con los campos de las combinaciones (no verificado: si las
   combinaciones aparecen en **Manage field names and IDs**). Si no aparecen, agrega en esta
   página listas desplegables propias con **Control field** `dupla`, `curso` y `hito_nombre`
   de cada combinación.

## Paso 8. Revisar y compartir

1. Revisa con **View** que ningún gráfico muestre nombres de estudiantes. La única columna con
   nombres de estudiantes es `integrantes_presentes`, de `Tutorias`, y no se usa en ninguna
   página.
2. Haz clic en **Share**. En **Add people**, escribe los correos de coordinación y del área de
   proyectos y elige **Can view** (pueden ver el informe, pero no editarlo ni compartirlo).
3. Si no quieres que les llegue un correo de aviso, desmarca **Notify people**. Haz clic en
   **Send**.

Quienes solo ven el informe no necesitan acceso a la planilla: las fuentes usan las credenciales
del propietario (paso 1.5). Para verlo necesitan iniciar sesión con una cuenta de Google.

## Paso 9. Si algo no cuadra

- **Un panel no muestra la tutoría recién guardada.** En la planilla, usa
  **Copiloto > Recalcular tablas de análisis**. Data Studio guarda los datos un rato antes de
  volver a leer la planilla (no verificado: cada cuánto los actualiza).
- **Un campo de fecha aparece como texto.** Cámbialo a fecha en la lista de campos de la fuente
  (paso 1.7). En `SemaforoDimensiones` y `EstadoEquipos`, el script escribe las fechas como
  fechas de la planilla, no como texto.
- **Un filtro no cambia un gráfico.** Revisa que el campo del filtro tenga el mismo ID en la
  fuente de ese gráfico (paso 3.4).

---

## Fuentes (documentación oficial de Google)

1. Cambio de nombre de Looker Studio a Data Studio, en las notas de versión:
   https://docs.cloud.google.com/data-studio/release-notes
2. Conectar con Google Sheets (**Create > Data Source**, **Use first row as headers**,
   **CONNECT**, **CREATE REPORT**, **ADD TO REPORT**):
   https://docs.cloud.google.com/data-studio/connect-to-google-sheets
3. Credenciales de datos (**Data credentials**, **Owner's Credentials**):
   https://docs.cloud.google.com/data-studio/data-credentials-article
4. Campos calculados (**ADD A FIELD**, **Add calculated field**, **Formula**, **SAVE**):
   https://docs.cloud.google.com/data-studio/add-edit-and-troubleshoot-calculated-fields
5. Lista de funciones (`MIN`, `AVG`, `SUM`, `CASE`, `IFNULL`, `TODAY`, `DATE_DIFF`,
   `DATETIME_DIFF`): https://docs.cloud.google.com/data-studio/function-list
6. `CASE` con condiciones `AND` y comparaciones:
   https://docs.cloud.google.com/data-studio/case-searched
7. `DATE_DIFF` (modo de compatibilidad): https://docs.cloud.google.com/data-studio/datediff
8. Filtros entre fuentes de datos (**Resource > Manage field names and IDs**,
   **Add field override**, **New ID**):
   https://docs.cloud.google.com/data-studio/use-controls-across-data-sources
9. Controles (**Add a control**, **Control field**, **Arrange > Make Report-level**):
   https://docs.cloud.google.com/data-studio/add-edit-controls
10. Tarjetas (**Scorecard**, **Setup**, **Metric**):
    https://docs.cloud.google.com/data-studio/scorecard-reference
11. Tablas: https://docs.cloud.google.com/data-studio/table-reference
12. Formato condicional (**STYLE**, **Conditional formatting**, **+ Add formatting**,
    **Single color**, **Select any field**, **Equal to**, **Save**):
    https://docs.cloud.google.com/data-studio/use-conditional-formatting-rules
13. Fechas por semana (**Edit**, **ISO Year Week**):
    https://docs.cloud.google.com/data-studio/dates-and-times
14. Series de tiempo: https://docs.cloud.google.com/data-studio/time-series-reference
15. Gráficos de barras:
    https://docs.cloud.google.com/data-studio/bar-chart-and-column-chart-reference
16. Combinar datos (**+BLEND DATA**, **Join another table**, configuración de la unión,
    **Save**): https://docs.cloud.google.com/data-studio/create-edit-and-manage-blends
17. Compartir un informe (**Share**, **Add people**, **Can view**, **Notify people**,
    **Send**): https://docs.cloud.google.com/data-studio/invite-others-to-your-reports
