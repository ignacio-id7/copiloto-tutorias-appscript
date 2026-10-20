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

// Datos ficticios: nunca datos reales en las pruebas.
const referencia = {
  tutores: [
    { alias: 'Ana', nombre: 'Ana', apellido: 'Pérez', activo: true },
    { alias: 'Luis', nombre: 'Luis', apellido: '', activo: true },
    { alias: 'Pepa R.', nombre: '', apellido: '', activo: true },
    { alias: 'Inactivo', nombre: 'Tito', apellido: 'Soto', activo: false }
  ],
  equipos: [
    { semestre: '2026-2', numero: 1, nombre: 'Dron para minería', curso: 'EL6030', dupla: 'Ana y Luis', integrantes: [], activo: true },
    { semestre: '2026-2', numero: 2, nombre: 'Kits de robotica accesibles', curso: 'EL4030', dupla: 'Ana y Luis',
      integrantes: ['Rosa Díaz', 'Pedro Lagos'], activo: true },
    { semestre: '2026-2', numero: 3, nombre: 'Equipo retirado', curso: 'EL4030', dupla: 'Ana y Luis', integrantes: [], activo: false }
  ],
  hitos: datos.HITOS_EJEMPLO.hitos,
  preguntas: datos.BANCO_PREGUNTAS.preguntas
};

function entradaValida(respuestas) {
  return {
    conduce: { alias: 'Ana' },
    registra: { nombre: 'luis', apellido: 'de la fuente' },
    equipoNumero: 2,
    hitoNumero: 1,
    respuestas
  };
}

test('prepararTutoria: copia textos y colores del banco, notas y nombres', () => {
  const resultado = prepararTutoria(
    entradaValida({
      'EL4030-H1-PRB-1': { indice: 2, nota: '  No saben   a quién entrevistar ' },
      'EL4030-H1-PRB-2': { otro: true, texto: '  Tienen  una encuesta ', color: 'amarillo' }
    }),
    referencia
  );
  assert.deepEqual(resultado.errores, []);
  assert.equal(resultado.tutoria.conduceNombre, 'Ana');
  assert.equal(resultado.tutoria.conduceApellido, 'Pérez');
  assert.equal(resultado.tutoria.registraApellido, 'De la Fuente');
  assert.equal(resultado.tutoria.equipoProyecto, 'Kits de robotica accesibles');
  assert.equal(resultado.tutoria.dupla, 'Ana y Luis');
  assert.equal(resultado.tutoria.hitoNombre, 'Hito 1');
  assert.deepEqual(
    resultado.respuestas.map((r) => [r.preguntaClave, r.respuestaTexto, r.color, r.respuestaPropia, r.nota]),
    [
      ['EL4030-H1-PRB-1', 'Aun no la definen', 'rojo', false, 'No saben a quién entrevistar'],
      ['EL4030-H1-PRB-2', 'Tienen una encuesta', 'amarillo', true, '']
    ]
  );
});

test('prepararTutoria: tutor de la lista sin nombre usa el alias; inactivos no valen', () => {
  const entrada = entradaValida({});
  entrada.registra = { alias: 'pepa r.' };
  const resultado = prepararTutoria(entrada, referencia);
  assert.deepEqual(resultado.errores, []);
  assert.equal(resultado.tutoria.registraNombre, 'Pepa R.');
  assert.equal(resultado.tutoria.registraApellido, '');

  entrada.registra = { alias: 'Inactivo' };
  assert.deepEqual(prepararTutoria(entrada, referencia).errores, ['Elige de la lista a quien toma notas.']);
});

test('prepararTutoria: rechaza tutores iguales, "Otro" sin color y preguntas fuera del guion', () => {
  const entrada = entradaValida({
    'EL4030-H1-PRB-1': { otro: true, texto: 'algo', color: '' },
    'EL5030-H1-PRB-1': { indice: 0 }
  });
  entrada.registra = { alias: 'ANA' };
  const { errores } = prepararTutoria(entrada, referencia);
  assert.equal(errores.length, 3);
  assert.ok(errores.includes('Quien conduce y quien toma notas deben ser personas distintas.'));
});

test('prepararTutoria: tutor escrito a mano igual a uno de la lista también se rechaza', () => {
  const entrada = entradaValida({});
  entrada.registra = { nombre: 'ana', apellido: 'perez' };
  assert.deepEqual(prepararTutoria(entrada, referencia).errores, [
    'Quien conduce y quien toma notas deben ser personas distintas.'
  ]);
});

test('prepararTutoria: integrantes de la lista y agregados a mano, sin repetir', () => {
  const entrada = entradaValida({});
  entrada.integrantes = {
    lista: ['Pedro Lagos', 'rosa diaz'],
    otros: [{ nombre: 'maría', apellido: 'soto' }, { nombre: 'Pedro', apellido: 'Lagos' }]
  };
  const resultado = prepararTutoria(entrada, referencia);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.tutoria.integrantesPresentes, ['Pedro Lagos', 'Rosa Díaz', 'María Soto']);

  entrada.integrantes = { lista: ['Alguien Más'], otros: [{ nombre: 'Solo', apellido: '' }] };
  assert.equal(prepararTutoria(entrada, referencia).errores.length, 2);
});

test('prepararTutoria: preguntas del tutor, consultas y compromisos', () => {
  const entrada = entradaValida({});
  entrada.preguntasTutor = [{ pregunta: ' ¿Cuándo prueban? ', respuesta: '' }, { pregunta: '', respuesta: '' }];
  entrada.consultas = [{ preguntaEquipo: '¿Podemos cambiar de idea?', respuestaTutor: 'Sí, antes del hito' }];
  entrada.compromisos = [{ descripcion: 'Entrevistar a 5 profesores', responsable: 'equipo' }];
  const resultado = prepararTutoria(entrada, referencia);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(resultado.preguntasTutor, [{ pregunta: '¿Cuándo prueban?', respuesta: '' }]);
  assert.deepEqual(resultado.consultas, [{ preguntaEquipo: '¿Podemos cambiar de idea?', respuestaTutor: 'Sí, antes del hito' }]);
  assert.deepEqual(resultado.compromisos, [{ descripcion: 'Entrevistar a 5 profesores', responsable: 'equipo' }]);
});

test('prepararTutoria: compromisos sin responsable, más de tres o respuesta sin pregunta', () => {
  const entrada = entradaValida({});
  entrada.preguntasTutor = [{ pregunta: '', respuesta: 'Una respuesta suelta' }];
  entrada.compromisos = [
    { descripcion: 'Uno', responsable: '' },
    { descripcion: 'Dos', responsable: 'tutores' },
    { descripcion: 'Tres', responsable: 'equipo' },
    { descripcion: 'Cuatro', responsable: 'equipo' }
  ];
  const { errores } = prepararTutoria(entrada, referencia);
  assert.deepEqual(errores, [
    'Falta el texto de la pregunta del tutor 1.',
    'Elige el responsable del compromiso 1.',
    'Se pueden registrar hasta 3 compromisos.'
  ]);
});

test('prepararTutoria: equipo inactivo no se puede elegir', () => {
  const entrada = entradaValida({});
  entrada.equipoNumero = 3;
  assert.ok(prepararTutoria(entrada, referencia).errores.includes('Elige un equipo de la lista.'));
});

test('prepararTutoria: equipo sin hitos cargados usa los genéricos', () => {
  const entrada = entradaValida({ 'EL6030-TODOS-PRB-1': { indice: 0 } });
  entrada.equipoNumero = 1;
  entrada.hitoNumero = 4;
  const resultado = prepararTutoria(entrada, referencia);
  assert.deepEqual(resultado.errores, []);
  assert.equal(resultado.tutoria.hitoNombre, 'Examen');
});
