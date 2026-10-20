const test = require('node:test');
const assert = require('node:assert/strict');
const { codigo } = require('./cargar');

const { semanaIso, armarPanel, resumirPanel, codigoCompartidoPanel } = codigo;

// Datos ficticios: nunca datos reales en las pruebas.
const HOY = '2026-10-20';

const equipos = [
  { semestre: '2026-2', numero: 1, nombre: 'Huerto urbano', curso: 'EL4030', dupla: 'Ana y Luis',
    integrantes: ['Rosa Díaz', 'Pedro Lagos'], activo: true },
  { semestre: '2026-2', numero: 2, nombre: 'Bus escolar', curso: 'EL5030', dupla: 'Rita y Pepa',
    integrantes: ['Marta Soto'], activo: true },
  { semestre: '2026-2', numero: 3, nombre: 'Riego solar', curso: 'EL4030', dupla: 'ana y luis',
    integrantes: ['Juan Pino'], activo: true },
  { semestre: '2026-2', numero: 4, nombre: 'Compost', curso: 'EL4030', dupla: 'Rita y Pepa',
    integrantes: [], activo: true },
  { semestre: '2026-2', numero: 5, nombre: 'Retirado', curso: 'EL4030', dupla: 'Ana y Luis',
    integrantes: [], activo: false },
  { semestre: '2026-1', numero: 1, nombre: 'Feria antigua', curso: 'EL4030', dupla: 'Ana y Luis',
    integrantes: ['Rosa Díaz'], activo: true }
];

const tutoria = (id, fecha, numero, hito, extra) => ({
  id, fecha, registrada_en: fecha + ' 10:00:00', semestre: '2026-2', equipo_numero: String(numero),
  equipo_proyecto: equipos.find((e) => e.numero === numero).nombre, curso: numero === 2 ? 'EL5030' : 'EL4030',
  dupla: numero === 2 || numero === 4 ? 'Rita y Pepa' : 'Ana y Luis', hito_numero: String(hito),
  hito_nombre: 'Hito ' + hito, conduce_nombre: 'Ana', conduce_apellido: 'Pérez', registra_nombre: 'Luis',
  registra_apellido: '', integrantes_presentes: 'Rosa Díaz, Pedro Lagos', ...extra
});

// Equipo 1: rojo en la primera tutoría, verde y amarillo en la última (hace 7 días).
// Equipo 2: rojo en su única tutoría, hace 20 días. Equipo 3: hace 14 días, verde.
// Equipo 4: ninguna tutoría.
const tutorias = [
  tutoria('t1', '2026-09-29', 1, 1),
  tutoria('t2', '2026-10-13', 1, 2, { dupla: 'ANA Y LUIS' }),
  tutoria('t3', '2026-09-30', 2, 1),
  tutoria('t4', '2026-10-06', 3, 2),
  { ...tutoria('t5', '2026-05-04', 1, 1), semestre: '2026-1', equipo_proyecto: 'Feria antigua' }
];
const respuestas = [
  { tutoria_id: 't1', dimension: 'PRB', color: 'rojo' },
  { tutoria_id: 't1', dimension: 'SOL', color: 'verde' },
  { tutoria_id: 't2', dimension: 'PRB', color: 'verde' },
  { tutoria_id: 't2', dimension: 'SOL', color: 'amarillo' },
  { tutoria_id: 't3', dimension: 'GES', color: 'rojo' },
  { tutoria_id: 't3', dimension: 'EQP', color: 'verde' },
  { tutoria_id: 't4', dimension: 'HIT', color: 'verde' },
  { tutoria_id: 't5', dimension: 'VAL', color: 'rojo' }
];
const actas = [
  { tutoria_id: 't1', estado: 'aprobada', documento_url: 'https://docs.google.com/document/d/ficticio' },
  { tutoria_id: 't2', estado: 'borrador', documento_url: '' }
];
const compromisos = [
  { tutoria_id: 't2', orden: '2', descripcion: 'Enviar contactos', responsable: 'tutores' },
  { tutoria_id: 't2', orden: '1', descripcion: 'Entrevistar a 5 vecinos', responsable: 'equipo' },
  { tutoria_id: 't3', orden: '1', descripcion: 'Probar el recorrido', responsable: 'equipo' },
  { tutoria_id: 'no-existe', orden: '1', descripcion: 'Huérfano', responsable: 'equipo' }
];
const consultas = [{ tutoria_id: 't1', orden: '1', pregunta_equipo: '¿Cambiamos de idea?', respuesta_tutor: 'No todavía' }];

const panel = armarPanel({ equipos, tutorias, respuestas, actas, compromisos, consultas }, HOY);
const semestre = { semestre: '2026-2' };

test('semana ISO: lunes como inicio, rótulo "Sem. 12 oct"', () => {
  assert.deepEqual(semanaIso('2026-10-14'), { clave: '2026-W42', lunes: '2026-10-12', rotulo: 'Sem. 12 oct' });
  assert.equal(semanaIso('2026-10-12').clave, '2026-W42');
  assert.equal(semanaIso('2026-10-18').clave, '2026-W42');
  assert.equal(semanaIso('2026-10-19').clave, '2026-W43');
  assert.equal(semanaIso(''), null);
});

test('semana ISO: cambio de año', () => {
  // 2026 tiene 53 semanas: el 1 de enero de 2027 (viernes) sigue en la semana 53 de 2026.
  assert.deepEqual(semanaIso('2026-12-31'), { clave: '2026-W53', lunes: '2026-12-28', rotulo: 'Sem. 28 dic' });
  assert.equal(semanaIso('2027-01-03').clave, '2026-W53');
  assert.equal(semanaIso('2027-01-04').clave, '2027-W01');
  // El 30 de diciembre de 2024 (lunes) ya es la semana 1 de 2025.
  assert.deepEqual(semanaIso('2024-12-30'), { clave: '2025-W01', lunes: '2024-12-30', rotulo: 'Sem. 30 dic' });
});

test('semestres: del más reciente al más antiguo', () => {
  assert.deepEqual(panel.semestres, ['2026-2', '2026-1']);
});

test('tarjetas: tutorías, equipos con rojo, sin tutoría en 14 días y actas aprobadas', () => {
  const { tarjetas } = resumirPanel(panel, semestre);
  assert.equal(tarjetas.tutorias, 4);
  assert.equal(tarjetas.equipos, 4);
  // Solo el equipo 2: el rojo del equipo 1 quedó en una tutoría anterior.
  assert.equal(tarjetas.equiposConRojo, 1);
  // Equipo 2 (20 días), equipo 3 (14 días) y equipo 4 (ninguna).
  assert.equal(tarjetas.sinTutoriaReciente, 3);
  assert.equal(tarjetas.actasAprobadas, 1);

  const todos = resumirPanel(panel, {}).tarjetas;
  assert.equal(todos.tutorias, 5);
  assert.equal(todos.equipos, 5);
});

test('sin tutoría en 14 días incluye a los equipos sin ninguna tutoría', () => {
  const cuatro = panel.equipos.find((e) => e.semestre === '2026-2' && e.numero === 4);
  assert.equal(cuatro.tutorias, 0);
  assert.equal(cuatro.diasDesdeUltima, null);
  assert.equal(cuatro.sinTutoriaReciente, true);
  const uno = panel.equipos.find((e) => e.semestre === '2026-2' && e.numero === 1);
  assert.equal(uno.diasDesdeUltima, 7);
  assert.equal(uno.sinTutoriaReciente, false);
  assert.equal(panel.equipos.find((e) => e.semestre === '2026-2' && e.numero === 3).sinTutoriaReciente, true);
});

test('estado actual: colores de la última tutoría del equipo', () => {
  const uno = panel.equipos.find((e) => e.semestre === '2026-2' && e.numero === 1);
  assert.equal(uno.ultimaFecha, '2026-10-13');
  assert.deepEqual(uno.colores, { PRB: 'verde', SOL: 'amarillo', VAL: '', EQP: '', GES: '', HIT: '' });
  assert.equal(uno.peor, 'amarillo');
  // La tutoría del semestre anterior es de otro equipo (otra clave semestre|número).
  assert.equal(uno.tutorias, 2);

  const { problemas } = resumirPanel(panel, semestre);
  const prb = problemas.find((p) => p.codigo === 'PRB');
  assert.deepEqual(prb, { codigo: 'PRB', verde: 1, amarillo: 0, rojo: 0, sinDato: 3 });
  const ges = problemas.find((p) => p.codigo === 'GES');
  assert.deepEqual(ges, { codigo: 'GES', verde: 0, amarillo: 0, rojo: 1, sinDato: 3 });
});

test('estado actual: el filtro de hito no lo cambia', () => {
  const conHito = resumirPanel(panel, { semestre: '2026-2', hito: 1 });
  const sinHito = resumirPanel(panel, semestre);
  assert.deepEqual(conHito.equipos, sinHito.equipos);
  assert.deepEqual(conHito.problemas, sinHito.problemas);
  assert.deepEqual(conHito.tarjetas, sinHito.tarjetas);
  // Pero sí la evolución y los compromisos.
  assert.deepEqual(conHito.semanas.map((s) => s.clave), ['2026-W40']);
  assert.deepEqual(conHito.compromisos.map((c) => c.descripcion), ['Probar el recorrido']);
});

test('orden del estado: rojos primero, después más días sin tutoría', () => {
  const { equipos: orden } = resumirPanel(panel, semestre);
  assert.deepEqual(orden.map((e) => e.numero), [2, 4, 3, 1]);
});

test('historial: tutorías con colores, estado del acta y enlace solo si está aprobada', () => {
  const t1 = panel.tutorias.find((t) => t.id === 't1');
  assert.equal(t1.acta, 'aprobada');
  assert.equal(t1.actaUrl, 'https://docs.google.com/document/d/ficticio');
  assert.equal(t1.colores.PRB, 'rojo');
  assert.equal(t1.esUltima, false);
  assert.equal(panel.tutorias.find((t) => t.id === 't2').acta, 'borrador');
  assert.equal(panel.tutorias.find((t) => t.id === 't3').acta, 'sin acta');
  assert.equal(panel.tutorias.find((t) => t.id === 't3').actaUrl, '');
  // Más recientes primero.
  assert.deepEqual(panel.tutorias.map((t) => t.id), ['t2', 't4', 't3', 't1', 't5']);
});

test('duplas: nombre de la dupla del equipo, agregados por dupla', () => {
  const { duplas } = resumirPanel(panel, semestre);
  assert.deepEqual(duplas.map((d) => d.dupla), ['Ana y Luis', 'Rita y Pepa']);
  const [anaLuis, ritaPepa] = duplas;
  // "ana y luis" y "ANA Y LUIS" son la misma dupla.
  assert.equal(anaLuis.equipos, 2);
  assert.equal(anaLuis.tutorias, 3);
  assert.equal(anaLuis.sinTutoriaReciente, 1);
  // Última tutoría: equipo 1 (PRB verde, SOL amarillo) y equipo 3 (HIT verde): 0 de 3 en rojo.
  assert.equal(anaLuis.porcentajeRojo, 0);
  assert.equal(anaLuis.actasPendientes, 2);

  assert.equal(ritaPepa.equipos, 2);
  assert.equal(ritaPepa.tutorias, 1);
  assert.equal(ritaPepa.sinTutoriaReciente, 2);
  // Equipo 2: GES rojo, EQP verde. Equipo 4 sin dato no cuenta.
  assert.equal(ritaPepa.porcentajeRojo, 50);
  assert.equal(ritaPepa.actasPendientes, 1);

  const soloRita = resumirPanel(panel, { semestre: '2026-2', dupla: 'Rita y Pepa' });
  assert.deepEqual(soloRita.equipos.map((e) => e.numero), [2, 4]);
  assert.equal(soloRita.tarjetas.tutorias, 1);
});

test('evolución: proporción de colores por semana ISO, sin contar los sin dato', () => {
  const { semanas } = resumirPanel(panel, semestre);
  assert.deepEqual(semanas.map((s) => [s.clave, s.rotulo]), [
    ['2026-W40', 'Sem. 28 sep'], ['2026-W41', 'Sem. 5 oct'], ['2026-W42', 'Sem. 12 oct']
  ]);
  // t1 (martes 29 sep) y t3 (miércoles 30 sep) caen en la misma semana.
  assert.deepEqual(semanas[0], { clave: '2026-W40', rotulo: 'Sem. 28 sep', tutorias: 2, verde: 2, amarillo: 0, rojo: 2, total: 4 });
  assert.equal(semanas[2].total, 2);
});

test('evolución: las tutorías de fin y comienzo de año quedan en la misma semana ISO', () => {
  const fin = [
    { ...tutoria('a', '2026-12-31', 1, 3) },
    { ...tutoria('b', '2027-01-02', 3, 3) },
    { ...tutoria('c', '2027-01-05', 1, 4) }
  ];
  const datos = { equipos, tutorias: fin, respuestas: [
    { tutoria_id: 'a', dimension: 'PRB', color: 'verde' },
    { tutoria_id: 'b', dimension: 'PRB', color: 'rojo' },
    { tutoria_id: 'c', dimension: 'PRB', color: 'amarillo' }
  ] };
  const { semanas } = resumirPanel(armarPanel(datos, '2027-01-06'), semestre);
  assert.deepEqual(semanas.map((s) => [s.clave, s.tutorias, s.verde, s.rojo, s.amarillo]), [
    ['2026-W53', 2, 1, 1, 0], ['2027-W01', 1, 0, 0, 1]
  ]);
});

test('compromisos y consultas: con el contexto de la tutoría, en orden', () => {
  assert.deepEqual(panel.compromisos.map((c) => [c.equipoNumero, c.hitoNombre, c.descripcion, c.responsable]), [
    [1, 'Hito 2', 'Entrevistar a 5 vecinos', 'Equipo'],
    [1, 'Hito 2', 'Enviar contactos', 'Tutores'],
    [2, 'Hito 1', 'Probar el recorrido', 'Equipo']
  ]);
  assert.deepEqual(panel.consultas[0], {
    tutoriaId: 't1', fecha: '2026-09-29', semestre: '2026-2', curso: 'EL4030', dupla: 'Ana y Luis',
    equipoNumero: 1, equipoProyecto: 'Huerto urbano', hitoNumero: 1, hitoNombre: 'Hito 1',
    pregunta: '¿Cambiamos de idea?', respuesta: 'No todavía'
  });
});

test('opciones de los filtros: las del semestre elegido', () => {
  const { opciones } = resumirPanel(panel, semestre);
  assert.deepEqual(opciones.cursos, ['EL4030', 'EL5030']);
  assert.deepEqual(opciones.duplas, ['Ana y Luis', 'Rita y Pepa']);
  assert.deepEqual(opciones.hitos, [{ numero: 1, nombre: 'Hito 1' }, { numero: 2, nombre: 'Hito 2' }]);
});

test('sin tutorías: tarjetas en cero y todos los equipos sin tutoría reciente', () => {
  const vacio = armarPanel({ equipos }, HOY);
  const { tarjetas, semanas } = resumirPanel(vacio, semestre);
  assert.deepEqual(tarjetas, { tutorias: 0, equipos: 4, equiposConRojo: 0, sinTutoriaReciente: 4, actasAprobadas: 0 });
  assert.deepEqual(semanas, []);
  assert.deepEqual(armarPanel({}, HOY).equipos, []);
});

test('privacidad: la salida no contiene integrantes ni integrantes_presentes en ningún nivel', () => {
  const claves = [];
  const recorrer = (valor) => {
    if (Array.isArray(valor)) valor.forEach(recorrer);
    else if (valor && typeof valor === 'object') {
      Object.keys(valor).forEach((clave) => {
        claves.push(clave);
        recorrer(valor[clave]);
      });
    }
  };
  recorrer(panel);
  recorrer(resumirPanel(panel, semestre));
  assert.ok(!claves.includes('integrantes'));
  assert.ok(!claves.includes('integrantes_presentes'));
  // Ni los nombres de los estudiantes en ningún texto.
  const texto = JSON.stringify(panel);
  for (const nombre of ['Rosa', 'Pedro', 'Marta', 'Juan Pino']) assert.ok(!texto.includes(nombre), nombre);
});

test('el navegador recibe resumirPanel sin depender de nada de fuera', () => {
  const copia = new Function(codigoCompartidoPanel() + '\nreturn resumirPanel;')();
  assert.deepEqual(copia(panel, semestre), resumirPanel(panel, semestre));
});
