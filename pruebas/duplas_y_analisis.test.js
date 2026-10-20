const test = require('node:test');
const assert = require('node:assert/strict');
const { codigo } = require('./cargar');

const {
  estaActivo,
  nombreVisibleTutor,
  separarIntegrantes,
  buscarDupla,
  equiposDeLaDupla,
  valorColor,
  peorColor,
  diasEntre,
  filasSemaforoDimensiones,
  filasEstadoEquipos,
  armarMinuta,
  armarPrompt
} = codigo;

// Datos ficticios: nunca datos reales en las pruebas.
const duplas = [
  { semestre: '2026-2', dupla: 'Ana y Luis', tutor_1: 'Ana', tutor_2: 'Luis', activa: 'TRUE' },
  { semestre: '2026-2', dupla: 'Rita y Pepa R.', tutor_1: 'Rita', tutor_2: 'Pepa R.', activa: 'VERDADERO' },
  { semestre: '2026-1', dupla: 'Ana y Tito', tutor_1: 'Ana', tutor_2: 'Tito', activa: 'FALSE' },
  { semestre: '2026-1', dupla: 'Antigua Ana y Luis', tutor_1: 'Luis', tutor_2: 'Ana', activa: 'TRUE' }
];

const equipos = [
  { semestre: '2026-2', numero: 3, nombre: 'Riego solar', curso: 'EL4030', dupla: 'Ana y Luis', activo: true },
  { semestre: '2026-2', numero: 1, nombre: 'Huerto urbano', curso: 'EL4030', dupla: 'ana y luis', activo: true },
  { semestre: '2026-2', numero: 2, nombre: 'Bus escolar', curso: 'EL5030', dupla: 'Rita y Pepa R.', activo: true },
  { semestre: '2026-2', numero: 4, nombre: 'Retirado', curso: 'EL4030', dupla: 'Ana y Luis', activo: false }
];

test('activo: vacío, TRUE, VERDADERO y SI cuentan; FALSE, FALSO, NO y 0 no', () => {
  for (const valor of ['', 'TRUE', 'true', 'VERDADERO', 'SI', true, null]) assert.equal(estaActivo(valor), true, String(valor));
  for (const valor of ['FALSE', 'falso', 'NO', '0', false]) assert.equal(estaActivo(valor), false, String(valor));
});

test('tutor: "nombre apellido", o el alias si falta el nombre', () => {
  assert.equal(nombreVisibleTutor({ alias: 'Ana', nombre: 'Ana', apellido: 'Pérez' }), 'Ana Pérez');
  assert.equal(nombreVisibleTutor({ alias: 'Luis', nombre: 'Luis', apellido: '' }), 'Luis');
  assert.equal(nombreVisibleTutor({ alias: 'Pepa R.', nombre: '', apellido: 'Rojas' }), 'Pepa R.');
});

test('integrantes: separados por coma, sin vacíos ni repetidos', () => {
  assert.deepEqual(separarIntegrantes(' Rosa  Díaz, Pedro Lagos,, rosa diaz ,'), ['Rosa Díaz', 'Pedro Lagos']);
  assert.deepEqual(separarIntegrantes(''), []);
});

test('dupla: se encuentra con los tutores en cualquier orden y sin importar tildes', () => {
  assert.equal(buscarDupla(duplas, 'Ana', 'Luis').dupla, 'Ana y Luis');
  assert.equal(buscarDupla(duplas, 'Luis', 'Ana').dupla, 'Ana y Luis');
  assert.equal(buscarDupla(duplas, 'pepa r.', 'RITA').dupla, 'Rita y Pepa R.');
});

test('dupla: inactiva, de otro par o con el mismo tutor dos veces no existe', () => {
  assert.equal(buscarDupla(duplas, 'Ana', 'Tito'), null);
  assert.equal(buscarDupla(duplas, 'Ana', 'Rita'), null);
  assert.equal(buscarDupla(duplas, 'Ana', 'Ana'), null);
  assert.equal(buscarDupla(duplas, 'Ana', ''), null);
});

test('equipos de la dupla: solo activos, por número, comparando el nombre sin mayúsculas', () => {
  const dupla = buscarDupla(duplas, 'Luis', 'Ana');
  assert.deepEqual(equiposDeLaDupla(equipos, dupla).map((e) => e.numero), [1, 3]);
  assert.deepEqual(equiposDeLaDupla(equipos, buscarDupla(duplas, 'Rita', 'Pepa R.')).map((e) => e.numero), [2]);
  assert.deepEqual(equiposDeLaDupla(equipos, null), []);
});

test('valor: rojo = 1, amarillo = 2, verde = 3; peor caso = mínimo', () => {
  assert.deepEqual(['rojo', 'amarillo', 'verde', 'Verde', 'azul', ''].map(valorColor), [1, 2, 3, 3, '', '']);
  assert.equal(peorColor(['verde', 'amarillo', 'verde']), 'amarillo');
  assert.equal(peorColor(['verde', undefined, 'rojo', 'amarillo']), 'rojo');
  assert.equal(peorColor(['verde']), 'verde');
  assert.equal(peorColor([undefined, 'sin dato']), '');
});

test('días entre fechas', () => {
  assert.equal(diasEntre('2026-10-06', '2026-10-20'), 14);
  assert.equal(diasEntre('2026-12-31', '2027-01-01'), 1);
  assert.equal(diasEntre('', '2026-10-20'), '');
});

// Equipo 1: dos tutorías (la segunda es la última). Equipo 2: una. Equipo 3: ninguna.
const tutorias = [
  { id: 't2', fecha: '2026-10-13', registrada_en: '2026-10-13 10:00:00', semestre: '2026-2', equipo_numero: '1',
    equipo_proyecto: 'Huerto urbano', curso: 'EL4030', dupla: 'Ana y Luis', hito_numero: '2', hito_nombre: 'Hito 2',
    conduce_nombre: 'Ana', conduce_apellido: 'Pérez', registra_nombre: 'Luis', registra_apellido: '' },
  { id: 't1', fecha: '2026-09-29', registrada_en: '2026-09-29 10:00:00', semestre: '2026-2', equipo_numero: '1',
    equipo_proyecto: 'Huerto urbano', curso: 'EL4030', dupla: 'Ana y Luis', hito_numero: '1', hito_nombre: 'Hito 1',
    conduce_nombre: 'Ana', conduce_apellido: 'Pérez', registra_nombre: 'Luis', registra_apellido: '' },
  { id: 't3', fecha: '2026-10-13', registrada_en: '2026-10-13 09:00:00', semestre: '2026-2', equipo_numero: '2',
    equipo_proyecto: 'Bus escolar', curso: 'EL5030', dupla: 'Rita y Pepa R.', hito_numero: '2', hito_nombre: 'Hito 2',
    conduce_nombre: 'Rita', conduce_apellido: '', registra_nombre: 'Pepa R.', registra_apellido: '' }
];
const respuestas = [
  { tutoria_id: 't1', dimension: 'PRB', color: 'rojo' },
  { tutoria_id: 't1', dimension: 'SOL', color: 'verde' },
  { tutoria_id: 't2', dimension: 'PRB', color: 'verde' },
  { tutoria_id: 't2', dimension: 'PRB', color: 'amarillo' },
  { tutoria_id: 't2', dimension: 'EQP', color: 'verde' },
  { tutoria_id: 't3', dimension: 'GES', color: 'rojo' }
];
const actas = [{ tutoria_id: 't1', estado: 'aprobada' }, { tutoria_id: 't2', estado: 'borrador' }];

test('SemaforoDimensiones: seis filas por tutoría, con peor caso, valor y contexto', () => {
  const filas = filasSemaforoDimensiones(tutorias, respuestas, actas);
  assert.equal(filas.length, 18);
  // Orden cronológico: t1, t3 (09:00), t2 (10:00).
  assert.deepEqual([...new Set(filas.map((f) => f.tutoria_id))], ['t1', 't3', 't2']);
  const prbT2 = filas.find((f) => f.tutoria_id === 't2' && f.dimension === 'PRB');
  assert.equal(prbT2.color, 'amarillo');
  assert.equal(prbT2.valor, 2);
  assert.equal(prbT2.equipo_numero, 1);
  assert.equal(prbT2.hito_numero, 2);
  assert.equal(prbT2.dupla, 'Ana y Luis');
  assert.equal(prbT2.conduce, 'Ana Pérez');
  assert.equal(prbT2.registra, 'Luis');
  assert.equal(prbT2.acta_estado, 'pendiente');
  const valT2 = filas.find((f) => f.tutoria_id === 't2' && f.dimension === 'VAL');
  assert.equal(valT2.color, 'sin dato');
  assert.equal(valT2.valor, '');
  assert.equal(filas.find((f) => f.tutoria_id === 't1').acta_estado, 'aprobada');
});

test('SemaforoDimensiones: es_ultima_del_equipo solo en la tutoría más reciente de cada equipo', () => {
  const filas = filasSemaforoDimensiones(tutorias, respuestas, actas);
  const ultimas = (id) => filas.filter((f) => f.tutoria_id === id).every((f) => f.es_ultima_del_equipo === true);
  const ninguna = (id) => filas.filter((f) => f.tutoria_id === id).every((f) => f.es_ultima_del_equipo === false);
  assert.ok(ninguna('t1'));
  assert.ok(ultimas('t2'));
  assert.ok(ultimas('t3'));
});

test('SemaforoDimensiones: misma fecha, gana la registrada después', () => {
  const mismaFecha = [
    { ...tutorias[0], id: 'a', registrada_en: '2026-10-13 18:00:00' },
    { ...tutorias[0], id: 'b', registrada_en: '2026-10-13 08:00:00' }
  ];
  const filas = filasSemaforoDimensiones(mismaFecha, [], []);
  assert.ok(filas.filter((f) => f.tutoria_id === 'a').every((f) => f.es_ultima_del_equipo));
  assert.ok(filas.filter((f) => f.tutoria_id === 'b').every((f) => !f.es_ultima_del_equipo));
});

test('EstadoEquipos: una fila por equipo activo, con la última tutoría y el peor color', () => {
  const semaforo = filasSemaforoDimensiones(tutorias, respuestas, actas);
  const estado = filasEstadoEquipos(equipos, semaforo, '2026-10-20');
  assert.deepEqual(estado.map((e) => e.equipo_numero), [1, 2, 3]);

  const [uno, dos, tres] = estado;
  assert.equal(uno.tutorias, 2);
  assert.equal(uno.ultima_fecha, '2026-10-13');
  assert.equal(uno.dias_desde_ultima, 7);
  assert.equal(uno.dupla, 'ana y luis');
  // Colores de la última tutoría (t2), no de la anterior: PRB ya no está en rojo.
  assert.equal(uno.color_prb, 'amarillo');
  assert.equal(uno.color_sol, 'sin dato');
  assert.equal(uno.color_eqp, 'verde');
  assert.equal(uno.peor_color, 'amarillo');
  assert.equal(uno.peor_valor, 2);

  assert.equal(dos.color_ges, 'rojo');
  assert.equal(dos.peor_color, 'rojo');
  assert.equal(dos.peor_valor, 1);

  assert.equal(tres.tutorias, 0);
  assert.equal(tres.ultima_fecha, '');
  assert.equal(tres.dias_desde_ultima, '');
  assert.equal(tres.peor_color, 'sin dato');
  assert.equal(tres.peor_valor, '');
});

test('acta completa: integrantes, notas, preguntas del tutor, consultas y compromisos', () => {
  const contexto = {
    fecha: '2026-10-20', semestre: '2026-2', equipoNumero: 1, equipoProyecto: 'Huerto urbano', curso: 'EL4030',
    hitoNumero: 2, hitoNombre: 'Hito 2', tutorConduce: 'Ana Pérez', tutorRegistra: 'Luis',
    integrantesPresentes: ['Rosa Díaz', 'Pedro Lagos'],
    respuestasBanco: [
      { dimension: 'PRB', preguntaTexto: '¿Problema?', textoElegido: 'Definido', colorElegido: 'verde', nota: 'Con datos', respuestaPropia: false }
    ],
    preguntasTutor: [{ pregunta: '¿Cuándo prueban?', respuesta: '' }],
    consultasEquipo: [{ preguntaEquipo: '¿Cambiamos de idea?', respuestaTutor: 'No todavía' }],
    compromisos: [
      { descripcion: 'Entrevistar a 5 vecinos', responsable: 'equipo' },
      { descripcion: 'Enviar contactos', responsable: 'tutores' }
    ]
  };
  const bloques = armarMinuta(contexto, '- Buen avance');
  const tablas = bloques.filter((b) => b.tipo === 'tabla');
  assert.deepEqual(tablas[0].filas[4], ['Integrantes presentes:', 'Rosa Díaz, Pedro Lagos']);
  assert.deepEqual(tablas[1].filas, [['Consulta 1', ''], ['Pregunta', '¿Problema?'], ['Respuesta', 'Definido. Nota: Con datos']]);
  assert.deepEqual(tablas[2].filas, [['Consulta 2', ''], ['Pregunta', '¿Cuándo prueban?'], ['Respuesta', '']]);
  assert.deepEqual(tablas[4].filas, [['Consulta del equipo', 'Respuesta del tutor'], ['¿Cambiamos de idea?', 'No todavía']]);
  assert.deepEqual(tablas[5].filas, [['Compromiso', 'Responsable'], ['Entrevistar a 5 vecinos', 'Equipo'], ['Enviar contactos', 'Tutores']]);

  const prompt = armarPrompt(contexto, null);
  assert.ok(prompt.includes('- [PRB] ¿Problema?: Definido (nota: Con datos)\n'));
  assert.ok(prompt.includes('- Pregunta: ¿Cuándo prueban? / Respuesta: (no se registro respuesta)\n'));
  assert.ok(prompt.includes('- Consulta: ¿Cambiamos de idea? / Respuesta: No todavía\n'));
  assert.ok(prompt.includes('- Entrevistar a 5 vecinos (responsable: Equipo)\n- Enviar contactos (responsable: Tutores)\n'));
  // Los nombres de los integrantes no van al modelo (igual que en la versión anterior).
  assert.ok(!prompt.includes('Rosa'));
});
