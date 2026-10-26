const test = require('node:test');
const assert = require('node:assert/strict');
const { codigo } = require('./cargar');

const { listarTutoriasParaEliminar, planEliminarTutorias } = codigo;

// Datos ficticios: nunca datos reales en las pruebas. `_fila` es el número de fila en la pestaña.
const tutoria = (id, fila, fecha, extra) => ({
  _fila: fila, id, registrada_en: fecha + ' 10:00:00', fecha, semestre: '2026-2', equipo_numero: '3',
  equipo_proyecto: 'Riego solar', curso: 'EL4030', dupla: 'Ana y Luis', hito_numero: '2', hito_nombre: 'Hito 2',
  conduce_nombre: 'Ana', registra_nombre: 'Luis', integrantes_presentes: 'Rosa Díaz, Pedro Lagos', ...extra
});
const hija = (tutoriaId, fila) => ({ _fila: fila, id: 'h' + fila, tutoria_id: tutoriaId });

// t1 sin acta, t2 con acta aprobada, t3 con borrador y t4, que no se toca, con acta aprobada.
const datos = {
  Tutorias: [tutoria('t1', 2, '2026-10-01'), tutoria('t2', 3, '2026-10-08'), tutoria('t3', 4, '2026-10-15'),
    tutoria('t4', 5, '2026-10-16')],
  Respuestas: [hija('t1', 2), hija('t2', 3), hija('t1', 4), hija('t4', 5), hija('t2', 6)],
  PreguntasTutor: [hija('t4', 2), hija('t2', 3)],
  ConsultasEquipo: [],
  Compromisos: [hija('t1', 2), hija('t3', 3), hija('t4', 4)],
  Actas: [
    { _fila: 2, tutoria_id: 't4', estado: 'aprobada', documento_id: 'doc4',
      documento_url: 'https://docs.google.com/document/d/doc4/edit', nombre_archivo: 'EL4030_Equipo3_Hito_2_2026-10-16.docx' },
    { _fila: 3, tutoria_id: 't2', estado: 'aprobada', documento_id: 'doc2',
      documento_url: 'https://docs.google.com/document/d/doc2/edit', nombre_archivo: 'EL4030_Equipo3_Hito_2_2026-10-08.docx' },
    { _fila: 4, tutoria_id: 't3', estado: 'borrador', documento_id: '', documento_url: '', nombre_archivo: '' }
  ]
};

test('plan: borra la tutoría y sus filas en cada pestaña, de mayor a menor', () => {
  const plan = planEliminarTutorias(datos, ['t1', 't2']);
  assert.deepEqual(plan.eliminadas, ['t1', 't2']);
  assert.deepEqual(plan.noEncontradas, []);
  assert.deepEqual(plan.filas, {
    Tutorias: [3, 2], Respuestas: [6, 4, 3, 2], PreguntasTutor: [3], ConsultasEquipo: [], Compromisos: [2], Actas: [3]
  });
});

test('plan: una tutoría sin acta no deja documentos', () => {
  const plan = planEliminarTutorias(datos, ['t1']);
  assert.deepEqual(plan.filas.Actas, []);
  assert.deepEqual(plan.documentos, []);
});

test('plan: el acta aprobada se borra de Actas y su documento queda en la lista para borrarlo a mano', () => {
  const plan = planEliminarTutorias(datos, ['t2']);
  assert.deepEqual(plan.filas.Actas, [3]);
  assert.deepEqual(plan.documentos, [{ tutoriaId: 't2', nombreArchivo: 'EL4030_Equipo3_Hito_2_2026-10-08.docx',
    url: 'https://docs.google.com/document/d/doc2/edit' }]);
});

test('plan: un acta en borrador se borra sin documento', () => {
  const plan = planEliminarTutorias(datos, ['t3']);
  assert.deepEqual(plan.filas, {
    Tutorias: [4], Respuestas: [], PreguntasTutor: [], ConsultasEquipo: [], Compromisos: [3], Actas: [4]
  });
  assert.deepEqual(plan.documentos, []);
});

test('plan: un id inexistente no borra nada y vuelve en noEncontradas', () => {
  const plan = planEliminarTutorias(datos, ['no-existe', '', null]);
  assert.deepEqual(plan.eliminadas, []);
  assert.deepEqual(plan.noEncontradas, ['no-existe']);
  Object.values(plan.filas).forEach((filas) => assert.deepEqual(filas, []));
  assert.deepEqual(plan.documentos, []);
});

test('plan: las filas de otras tutorías no se tocan e ids repetidos cuentan una vez', () => {
  const plan = planEliminarTutorias(datos, ['t1', 't1', ' t1 ', 'no-existe']);
  assert.deepEqual(plan.eliminadas, ['t1']);
  assert.deepEqual(plan.noEncontradas, ['no-existe']);
  const tocadas = (nombre) => datos[nombre].filter((r) => plan.filas[nombre].includes(r._fila));
  assert.ok(tocadas('Tutorias').every((t) => t.id === 't1'));
  ['Respuestas', 'PreguntasTutor', 'ConsultasEquipo', 'Compromisos', 'Actas'].forEach((nombre) => {
    assert.ok(tocadas(nombre).every((r) => r.tutoria_id === 't1'), nombre);
  });
  assert.equal(plan.filas.Tutorias.length, 1);
  assert.equal(plan.filas.Respuestas.length, 2);
});

test('plan: un acta aprobada sin documento_url arma el enlace con documento_id', () => {
  const plan = planEliminarTutorias({
    Tutorias: [tutoria('t9', 2, '2026-10-20')],
    Actas: [{ _fila: 2, tutoria_id: 't9', estado: 'aprobada', documento_id: 'doc9', documento_url: '', nombre_archivo: '' }]
  }, ['t9']);
  assert.deepEqual(plan.documentos, [{ tutoriaId: 't9', nombreArchivo: '', url: 'https://docs.google.com/document/d/doc9/edit' }]);
  assert.deepEqual(plan.filas.Respuestas, []);
});

test('lista del diálogo: más recientes primero, con el estado del acta', () => {
  const lista = listarTutoriasParaEliminar(datos.Tutorias, datos.Actas);
  assert.deepEqual(lista.map((t) => t.id), ['t4', 't3', 't2', 't1']);
  assert.deepEqual(lista.map((t) => t.acta), ['aprobada', 'borrador', 'aprobada', 'sin acta']);
  assert.deepEqual(lista[0], {
    id: 't4', fecha: '2026-10-16', semestre: '2026-2', curso: 'EL4030', equipoNumero: 3, equipoProyecto: 'Riego solar',
    hitoNombre: 'Hito 2', dupla: 'Ana y Luis', registradaEn: '2026-10-16 10:00:00', acta: 'aprobada'
  });
});

test('lista del diálogo: ningún dato de estudiantes', () => {
  const texto = JSON.stringify(listarTutoriasParaEliminar(datos.Tutorias, datos.Actas));
  assert.ok(!texto.includes('Rosa Díaz'));
  assert.ok(!texto.includes('Pedro Lagos'));
  assert.ok(!texto.includes('integrantes'));
});
