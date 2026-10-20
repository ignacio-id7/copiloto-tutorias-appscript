const test = require('node:test');
const assert = require('node:assert/strict');
const { codigo, datos } = require('./cargar');

const {
  calcularSemaforo,
  normalizarNombre,
  hitosDelCurso,
  hitoSugerido,
  preguntasDelGuion,
  prepararTutoria,
  DIMENSIONES
} = codigo;

test('semáforo: una roja deja la dimensión en rojo', () => {
  const semaforo = calcularSemaforo([
    { dimension: 'PRB', color: 'verde' },
    { dimension: 'PRB', color: 'rojo' },
    { dimension: 'PRB', color: 'amarillo' }
  ]);
  assert.deepEqual(semaforo, { PRB: 'rojo' });
});

test('semáforo: sin rojas, una amarilla deja la dimensión en amarillo', () => {
  assert.equal(
    calcularSemaforo([
      { dimension: 'SOL', color: 'verde' },
      { dimension: 'SOL', color: 'amarillo' }
    ]).SOL,
    'amarillo'
  );
});

test('semáforo: verde solo si todas son verdes; sin respuestas no hay dato', () => {
  const semaforo = calcularSemaforo([
    { dimension: 'VAL', color: 'verde' },
    { dimension: 'VAL', color: 'verde' },
    { dimension: 'EQP', color: 'amarillo' }
  ]);
  assert.deepEqual(semaforo, { VAL: 'verde', EQP: 'amarillo' });
  assert.equal(semaforo.HIT, undefined);
});

test('semáforo: ignora colores y dimensiones desconocidos', () => {
  assert.deepEqual(
    calcularSemaforo([
      { dimension: 'PRB', color: 'azul' },
      { dimension: 'XYZ', color: 'rojo' }
    ]),
    {}
  );
});

test('normalizarNombre: espacios, mayúsculas, partículas, guiones y tildes', () => {
  assert.equal(normalizarNombre('  maría   josé  '), 'María José');
  assert.equal(normalizarNombre('DE LA FUENTE'), 'De la Fuente');
  assert.equal(normalizarNombre('pérez y gonzález'), 'Pérez y González');
  assert.equal(normalizarNombre('ana-maría'), 'Ana-María');
  assert.equal(normalizarNombre('   '), '');
});

test('hitos: genéricos si el curso no tiene; sugerido = próximo desde hoy', () => {
  const hitos = datos.HITOS_EJEMPLO.hitos;
  assert.deepEqual(
    hitosDelCurso(hitos, 'EL6030').map((h) => h.nombre),
    ['Hito 1', 'Hito 2', 'Hito 3', 'Examen']
  );
  const delCurso = hitosDelCurso(hitos, 'EL4030');
  assert.equal(hitoSugerido(delCurso, '2026-10-19').numero, 3);
  assert.equal(hitoSugerido(delCurso, '2026-10-06').numero, 2);
  assert.equal(hitoSugerido(delCurso, '2027-01-01').numero, 4);
  assert.equal(hitoSugerido(hitosDelCurso([], 'EL6030'), '2026-10-19').numero, 1);
});

test('guion: curso e hito, más las de todos los hitos, ordenado por dimensión', () => {
  const guion = preguntasDelGuion(datos.BANCO_PREGUNTAS.preguntas, 'EL4030', 1);
  assert.ok(guion.length > 0 && guion.length <= 10);
  assert.ok(guion.every((p) => p.curso === 'EL4030' && (p.hito_numero === null || p.hito_numero === 1)));
  const indices = guion.map((p) => DIMENSIONES.indexOf(p.dimension));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  assert.ok(guion.some((p) => p.clave === 'EL4030-TODOS-EQP-1'));
});

test('guion: las preguntas inactivas no salen', () => {
  const preguntas = datos.BANCO_PREGUNTAS.preguntas.map((p) =>
    p.clave === 'EL4030-TODOS-EQP-1' ? { ...p, activa: false } : p
  );
  assert.ok(!preguntasDelGuion(preguntas, 'EL4030', 1).some((p) => p.clave === 'EL4030-TODOS-EQP-1'));
});

test('banco: todas las alternativas tienen color de semáforo', () => {
  for (const pregunta of datos.BANCO_PREGUNTAS.preguntas) {
    assert.ok(DIMENSIONES.includes(pregunta.dimension), pregunta.clave);
    assert.ok(pregunta.alternativas.length >= 2 && pregunta.alternativas.length <= 5, pregunta.clave);
    for (const alternativa of pregunta.alternativas) {
      assert.ok(['verde', 'amarillo', 'rojo'].includes(alternativa.color), pregunta.clave);
    }
  }
});

const referencia = {
  equipos: datos.EQUIPOS_EJEMPLO.equipos.map((e) => ({ ...e, semestre: '2026-2' })),
  hitos: datos.HITOS_EJEMPLO.hitos,
  preguntas: datos.BANCO_PREGUNTAS.preguntas
};

function entradaValida(respuestas) {
  return {
    conduce: { nombre: ' ana ', apellido: 'pérez' },
    registra: { nombre: 'luis', apellido: 'de la fuente' },
    equipoNumero: 2,
    hitoNumero: 1,
    respuestas
  };
}

test('prepararTutoria: copia textos y colores del banco y normaliza nombres', () => {
  const resultado = prepararTutoria(
    entradaValida({
      'EL4030-H1-PRB-1': { indice: 2 },
      'EL4030-H1-PRB-2': { otro: true, texto: '  Tienen  una encuesta ', color: 'amarillo' }
    }),
    referencia
  );
  assert.deepEqual(resultado.errores, []);
  assert.equal(resultado.tutoria.conduceNombre, 'Ana');
  assert.equal(resultado.tutoria.registraApellido, 'De la Fuente');
  assert.equal(resultado.tutoria.equipoProyecto, 'Kits de robotica accesibles');
  assert.equal(resultado.tutoria.hitoNombre, 'Hito 1');
  assert.deepEqual(
    resultado.respuestas.map((r) => [r.preguntaClave, r.respuestaTexto, r.color, r.respuestaPropia]),
    [
      ['EL4030-H1-PRB-1', 'Aun no la definen', 'rojo', false],
      ['EL4030-H1-PRB-2', 'Tienen una encuesta', 'amarillo', true]
    ]
  );
});

test('prepararTutoria: rechaza tutores iguales, "Otro" sin color y preguntas fuera del guion', () => {
  const entrada = entradaValida({
    'EL4030-H1-PRB-1': { otro: true, texto: 'algo', color: '' },
    'EL5030-H1-PRB-1': { indice: 0 }
  });
  entrada.registra = { nombre: 'ANA', apellido: 'Perez' };
  const { errores } = prepararTutoria(entrada, referencia);
  assert.equal(errores.length, 3);
});

test('prepararTutoria: equipo sin hitos cargados usa los genéricos', () => {
  const entrada = entradaValida({ 'EL6030-TODOS-PRB-1': { indice: 0 } });
  entrada.equipoNumero = 1;
  entrada.hitoNumero = 4;
  const resultado = prepararTutoria(entrada, referencia);
  assert.deepEqual(resultado.errores, []);
  assert.equal(resultado.tutoria.hitoNombre, 'Examen');
});
