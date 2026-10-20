const test = require('node:test');
const assert = require('node:assert/strict');
const { codigo } = require('./cargar');

const {
  armarPrompt,
  armarObservacionesRespaldo,
  clasificarErrorGemini,
  textoDeRespuestaGemini,
  generarConCascada,
  lineasObservaciones,
  armarMinuta,
  nombreArchivoActa,
  MODELOS_GEMINI
} = codigo;

function contexto(cambios) {
  return {
    fecha: '2026-10-19',
    semestre: '2026-2',
    equipoNumero: 2,
    equipoProyecto: 'Kits de robotica accesibles',
    curso: 'EL4030',
    hitoNumero: 3,
    hitoNombre: 'Hito 3',
    tutorConduce: 'Ana Pérez',
    tutorRegistra: 'Luis de la Fuente',
    integrantesPresentes: [],
    respuestasBanco: [
      { dimension: 'PRB', preguntaTexto: 'Tienen definida la problematica?', textoElegido: 'Aun no la definen', colorElegido: 'rojo', nota: '', respuestaPropia: false },
      { dimension: 'SOL', preguntaTexto: 'Tienen prototipo?', textoElegido: 'Uno en carton', colorElegido: 'amarillo', nota: '', respuestaPropia: true },
      { dimension: 'EQP', preguntaTexto: 'Participan todos?', textoElegido: 'Todos participan', colorElegido: 'verde', nota: '', respuestaPropia: false }
    ],
    preguntasTutor: [],
    consultasEquipo: [],
    compromisos: [],
    ...cambios
  };
}

test('prompt: datos de la sesión, semáforo calculado y respuestas', () => {
  const prompt = armarPrompt(contexto(), null);
  assert.ok(prompt.startsWith('Eres un asistente que redacta la seccion "Observaciones generales de la\nreunion"'));
  assert.ok(prompt.includes('- Equipo 2: Kits de robotica accesibles (EL4030)\n- Hito 3\n- Fecha: 19-10-2026\n'));
  assert.ok(prompt.includes('- PRB (Problema y cliente): rojo\n- SOL (Solucion y prototipo): amarillo\n- VAL (Validacion y aprendizaje): sin dato\n'));
  assert.ok(prompt.includes('- [PRB] Tienen definida la problematica?: Aun no la definen\n'));
  assert.ok(prompt.includes('- [SOL] Tienen prototipo?: Uno en carton (respuesta propia del tutor, semaforo amarillo)\n'));
  assert.ok(prompt.includes('Preguntas que hizo el tutor y lo que respondio el equipo:\nNinguna\n'));
  assert.ok(prompt.includes('Compromisos:\nNinguno\n\nInstrucciones:\n'));
  assert.ok(prompt.endsWith('- No asignes ni cambies colores de semaforo.\n- Maximo 250 palabras. Sin encabezados ni titulos.\n'));
  assert.ok(!prompt.includes('Rubrica'));
});

test('prompt: con rúbrica agrega el bloque y la regla dura', () => {
  const prompt = armarPrompt(contexto(), 'Criterio: claridad del problema');
  assert.ok(prompt.includes('<<<\nCriterio: claridad del problema\n>>>\n'));
  assert.ok(prompt.includes('NUNCA\n  afirmes a partir de ella hechos'));
});

test('prompt: preguntas del tutor, consultas y compromisos (para cuando entren al flujo)', () => {
  const prompt = armarPrompt(
    contexto({
      preguntasTutor: [{ pregunta: 'Cuando prueban?', respuesta: '' }],
      consultasEquipo: [{ preguntaEquipo: 'Podemos cambiar de idea?', respuestaTutor: 'Si, antes del hito' }],
      compromisos: [{ descripcion: 'Entrevistar a 5 profesores', responsable: 'equipo' }]
    }),
    null
  );
  assert.ok(prompt.includes('- Pregunta: Cuando prueban? / Respuesta: (no se registro respuesta)'));
  assert.ok(prompt.includes('- Consulta: Podemos cambiar de idea? / Respuesta: Si, antes del hito'));
  assert.ok(prompt.includes('- Entrevistar a 5 profesores (responsable: Equipo)'));
});

test('plantilla sin IA: dimensiones por color y compromisos', () => {
  assert.equal(
    armarObservacionesRespaldo(contexto()),
    [
      '- Dimensiones en rojo: PRB.',
      '- Dimensiones en amarillo: SOL.',
      '- Dimensiones en verde: EQP.',
      '- No se acordaron compromisos.'
    ].join('\n')
  );
  assert.ok(
    armarObservacionesRespaldo(contexto({ respuestasBanco: [] })).startsWith(
      '- No se registraron respuestas del guion estandar.'
    )
  );
});

test('clasificación de errores de Gemini', () => {
  assert.equal(clasificarErrorGemini(429, ''), 'cuota');
  assert.equal(clasificarErrorGemini(400, '{"error":{"status":"RESOURCE_EXHAUSTED"}}'), 'cuota');
  assert.equal(clasificarErrorGemini(503, ''), 'transitorio');
  assert.equal(clasificarErrorGemini(404, ''), 'otro');
  assert.equal(clasificarErrorGemini(403, ''), 'otro');
});

test('texto de la respuesta: une las partes y salta el razonamiento', () => {
  const cuerpo = JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: '- Uno\n' }, { text: '- Dos' }] } }]
  });
  assert.equal(textoDeRespuestaGemini(cuerpo), '- Uno\n- Dos');
  assert.equal(textoDeRespuestaGemini('no es json'), '');
  assert.equal(textoDeRespuestaGemini('{"candidates":[]}'), '');
});

function respuestaOk(texto) {
  return { codigo: 200, cuerpo: JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
}

function simulador(guion) {
  const llamadas = [];
  const esperas = [];
  return {
    llamadas,
    esperas,
    llamar(modelo) {
      llamadas.push(modelo);
      const siguiente = guion.shift();
      if (siguiente instanceof Error) throw siguiente;
      return siguiente;
    },
    esperar(ms) {
      esperas.push(ms);
    }
  };
}

test('cascada: el orden de modelos es el de la versión anterior', () => {
  assert.deepEqual(MODELOS_GEMINI, ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
});

test('cascada: sin clave no llama a nadie', () => {
  const s = simulador([]);
  const resultado = generarConCascada({ prompt: 'p', clave: '', llamar: s.llamar, esperar: s.esperar });
  assert.equal(resultado.texto, null);
  assert.equal(s.llamadas.length, 0);
});

test('cascada: el principal responde a la primera', () => {
  const s = simulador([respuestaOk('- Bien')]);
  const resultado = generarConCascada({ prompt: 'p', clave: 'k', llamar: s.llamar, esperar: s.esperar });
  assert.deepEqual([resultado.texto, resultado.modelo], ['- Bien', 'gemini-3.5-flash']);
});

test('cascada: cuota baja de inmediato, sin esperar ni reintentar', () => {
  const s = simulador([{ codigo: 429, cuerpo: '' }, respuestaOk('- Lite')]);
  const resultado = generarConCascada({ prompt: 'p', clave: 'k', llamar: s.llamar, esperar: s.esperar });
  assert.equal(resultado.modelo, 'gemini-3.5-flash-lite');
  assert.deepEqual(s.llamadas, ['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  assert.deepEqual(s.esperas, []);
});

test('cascada: transitorio reintenta el mismo con espera creciente y luego baja', () => {
  const s = simulador([
    { codigo: 503, cuerpo: '' },
    new Error('red caída'),
    { codigo: 500, cuerpo: '' },
    respuestaOk('- Respaldo')
  ]);
  const resultado = generarConCascada({ prompt: 'p', clave: 'k', llamar: s.llamar, esperar: s.esperar });
  assert.deepEqual(s.llamadas, ['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  assert.deepEqual(s.esperas, [1000, 2000]);
  assert.equal(resultado.modelo, 'gemini-3.5-flash-lite');
});

test('cascada: otro error o respuesta vacía bajan sin reintentar; agotada, devuelve null', () => {
  const s = simulador([{ codigo: 404, cuerpo: '' }, respuestaOk('   '), { codigo: 403, cuerpo: '' }]);
  const resultado = generarConCascada({ prompt: 'p', clave: 'k', llamar: s.llamar, esperar: s.esperar });
  assert.deepEqual(s.llamadas, MODELOS_GEMINI);
  assert.equal(resultado.texto, null);
  assert.equal(resultado.modelo, null);
  assert.ok(resultado.bitacora.at(-1).includes('plantilla sin IA'));
});

test('cascada: pasado el presupuesto de tiempo no empieza otro intento', () => {
  let reloj = 0;
  const s = simulador([{ codigo: 429, cuerpo: '' }, respuestaOk('- No debería llegar')]);
  const resultado = generarConCascada({
    prompt: 'p',
    clave: 'k',
    llamar: (modelo) => {
      reloj += 300000;
      return s.llamar(modelo);
    },
    esperar: s.esperar,
    ahora: () => reloj
  });
  assert.equal(resultado.texto, null);
  assert.deepEqual(s.llamadas, ['gemini-3.5-flash']);
});

test('observaciones: una viñeta por línea, sin guiones ni líneas vacías', () => {
  assert.deepEqual(lineasObservaciones('- Uno\n\n* Dos\n  • Tres  \nCuatro'), ['Uno', 'Dos', 'Tres', 'Cuatro']);
});

test('minuta: secciones de la minuta manual, en orden', () => {
  const bloques = armarMinuta(contexto(), '- Primera\n- Segunda');
  assert.deepEqual(
    bloques.filter((b) => b.tipo === 'encabezado').map((b) => b.texto),
    [
      '1. Información General',
      '2. Consultas y Respuestas',
      '3. Observaciones Generales de la Reunión',
      '4. Estado por Dimensión',
      '5. Consultas del Equipo',
      '6. Compromisos'
    ]
  );
  assert.deepEqual(bloques[0], { tipo: 'titulo', texto: 'Minuta de Seguimiento' });
  assert.deepEqual(bloques[1], { tipo: 'parrafo', texto: 'EL4030 - Hito 3' });
  assert.deepEqual(bloques[3].filas, [
    ['Fecha de la reunión:', '19/10/2026'],
    ['Tutores presentes:', 'Conduce: Ana Pérez; Registra: Luis de la Fuente'],
    ['Grupo N°:', '2'],
    ['Proyecto:', 'Kits de robotica accesibles'],
    ['Integrantes presentes:', 'Sin dato']
  ]);
});

test('minuta: consultas, respuesta propia, viñetas y semáforo', () => {
  const bloques = armarMinuta(contexto(), '- Primera\n- Segunda');
  const consultas = bloques.filter((b) => b.tipo === 'tabla' && b.filas[0][0].startsWith('Consulta '));
  assert.equal(consultas.length, 3);
  assert.deepEqual(consultas[1].filas, [
    ['Consulta 2', ''],
    ['Pregunta', 'Tienen prototipo?'],
    ['Respuesta', 'Uno en carton (respuesta propia; semáforo: Amarillo)']
  ]);
  assert.deepEqual(bloques.find((b) => b.tipo === 'vinetas').lineas, ['Primera', 'Segunda']);
  const semaforo = bloques.find((b) => b.tipo === 'tabla' && b.filas[0][0] === 'Dimensión');
  assert.deepEqual(semaforo.filas.slice(1).map((f) => f[1]), ['Rojo', 'Amarillo', 'Sin dato', 'Verde', 'Sin dato', 'Sin dato']);
  assert.equal(semaforo.filas[1][0], 'PRB — Problema y cliente');
  const finales = bloques.slice(-3).map((b) => b.texto);
  assert.deepEqual(finales, ['Sin consultas del equipo.', '6. Compromisos', 'Sin compromisos.']);
});

test('minuta: sin respuestas lo dice', () => {
  const bloques = armarMinuta(contexto({ respuestasBanco: [] }), '');
  assert.ok(bloques.some((b) => b.texto === 'Sin consultas registradas.'));
  assert.deepEqual(bloques.find((b) => b.tipo === 'vinetas').lineas, ['']);
});

test('nombre de archivo: sin tildes ni espacios', () => {
  assert.equal(nombreArchivoActa(contexto()), 'EL4030_Equipo2_Hito_3_2026-10-19.docx');
  assert.equal(nombreArchivoActa(contexto({ hitoNombre: 'Exámen final' })), 'EL4030_Equipo2_Examen_final_2026-10-19.docx');
});
