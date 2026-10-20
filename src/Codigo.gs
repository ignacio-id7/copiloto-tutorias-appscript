/**
 * Copiloto de Tutorías de Impulsa DIE: servidor de la aplicación web (Apps Script).
 *
 * El archivo tiene dos partes:
 * 1. Funciones puras (semáforo, guion, prompt, plantilla sin IA, cascada de Gemini, minuta).
 *    No tocan ningún servicio de Google y se prueban con `node --test pruebas/`.
 * 2. Funciones de Apps Script: planilla, aplicación web, Gemini por UrlFetchApp y acta en
 *    Google Docs.
 *
 * Los datos viven en la planilla (una pestaña por entidad). El acta se arma solo desde la
 * copia guardada en Tutorias y Respuestas, nunca desde el banco vigente.
 */

// ===========================================================================================
// 1. Funciones puras
// ===========================================================================================

var DIMENSIONES = ['PRB', 'SOL', 'VAL', 'EQP', 'GES', 'HIT'];

var NOMBRES_DIMENSION = {
  PRB: 'Problema y cliente',
  SOL: 'Solucion y prototipo',
  VAL: 'Validacion y aprendizaje',
  EQP: 'Equipo y roles',
  GES: 'Gestion y ritmo',
  HIT: 'Preparacion del hito'
};

var COLORES = ['verde', 'amarillo', 'rojo'];
var PRIORIDAD_COLOR = { verde: 1, amarillo: 2, rojo: 3 };
var ETIQUETAS_SEMAFORO = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };
var ETIQUETAS_RESPONSABLE = { equipo: 'Equipo', tutores: 'Tutores' };

// Hitos genéricos para un curso sin hitos cargados: el hito es obligatorio. 4 = Examen.
var HITOS_GENERICOS = [
  { numero: 1, nombre: 'Hito 1', fecha: '' },
  { numero: 2, nombre: 'Hito 2', fecha: '' },
  { numero: 3, nombre: 'Hito 3', fecha: '' },
  { numero: 4, nombre: 'Examen', fecha: '' }
];

var PARTICULAS = ['de', 'del', 'la', 'las', 'los', 'y'];
var MAXIMO_RESPUESTA_PROPIA = 300;
var MAXIMO_NOMBRE = 120;
var MAXIMO_OBSERVACIONES = 5000;
var MAXIMO_PALABRAS_OBSERVACIONES = 250;

// Cascada de Gemini. La serie 2.5 quedó con acceso restringido: no se usa.
var MODELOS_GEMINI = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
var INTENTOS_POR_MODELO = 3;
var ESPERA_BASE_MS = 1000;
// Una ejecución de Apps Script dura como máximo 6 minutos; pasado este presupuesto no se
// empieza otro intento y el acta sale de la plantilla sin IA.
var PRESUPUESTO_CASCADA_MS = 240000;

/** Recorta, colapsa espacios y capitaliza cada palabra; partículas en minúscula salvo al inicio. */
function normalizarNombre(texto) {
  var palabras = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim().split(' ');
  if (palabras.length === 1 && palabras[0] === '') return '';
  return palabras
    .map(function (palabra, indice) {
      var minuscula = palabra.toLowerCase();
      if (indice > 0 && PARTICULAS.indexOf(minuscula) !== -1) return minuscula;
      // "maria-jose" -> "Maria-Jose"
      return palabra
        .split('-')
        .map(function (parte) {
          return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
        })
        .join('-');
    })
    .join(' ');
}

/** Clave para comparar nombres sin tildes ni mayúsculas. */
function claveNombre(texto) {
  return normalizarNombre(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Semáforo por dimensión con la regla de peor caso: una roja deja la dimensión en rojo; sin
 * rojas, una amarilla la deja en amarillo; verde solo si todas son verdes. Las dimensiones sin
 * respuestas no aparecen en el resultado ("sin dato").
 */
function calcularSemaforo(respuestas) {
  var peor = {};
  (respuestas || []).forEach(function (respuesta) {
    var color = respuesta.color;
    if (!PRIORIDAD_COLOR[color] || DIMENSIONES.indexOf(respuesta.dimension) === -1) return;
    var actual = peor[respuesta.dimension];
    if (!actual || PRIORIDAD_COLOR[color] > PRIORIDAD_COLOR[actual]) {
      peor[respuesta.dimension] = color;
    }
  });
  return peor;
}

/** Hitos del curso ordenados por fecha y número; los genéricos si el curso no tiene. */
function hitosDelCurso(hitos, curso) {
  var delCurso = (hitos || []).filter(function (hito) {
    return hito.curso === curso;
  });
  if (delCurso.length === 0) return HITOS_GENERICOS.slice();
  return delCurso.slice().sort(function (a, b) {
    return String(a.fecha).localeCompare(String(b.fecha)) || a.numero - b.numero;
  });
}

/** El próximo hito desde hoy; si todos pasaron, el último. Hoy y fechas en 'AAAA-MM-DD'. */
function hitoSugerido(hitosOrdenados, hoy) {
  if (!hitosOrdenados.length) return null;
  for (var i = 0; i < hitosOrdenados.length; i++) {
    if (hitosOrdenados[i].fecha && hitosOrdenados[i].fecha >= hoy) return hitosOrdenados[i];
  }
  var conFecha = hitosOrdenados.filter(function (hito) {
    return hito.fecha;
  });
  return conFecha.length ? conFecha[conFecha.length - 1] : hitosOrdenados[0];
}

/** Preguntas activas del curso para el hito (o para todos los hitos), en orden de dimensión. */
function preguntasDelGuion(preguntas, curso, hitoNumero) {
  return (preguntas || [])
    .filter(function (pregunta) {
      return (
        pregunta.activa !== false &&
        pregunta.curso === curso &&
        (pregunta.hito_numero === null || pregunta.hito_numero === hitoNumero)
      );
    })
    .map(function (pregunta, indice) {
      return { pregunta: pregunta, indice: indice };
    })
    .sort(function (a, b) {
      return (
        DIMENSIONES.indexOf(a.pregunta.dimension) - DIMENSIONES.indexOf(b.pregunta.dimension) ||
        a.indice - b.indice
      );
    })
    .map(function (par) {
      return par.pregunta;
    });
}

/**
 * Valida lo que manda el navegador y arma la copia que se guarda. No confía en los textos del
 * cliente: pregunta, alternativa y color salen del banco; solo "Otro" trae texto y color propios.
 *
 * entrada: { conduce: {nombre, apellido}, registra: {nombre, apellido}, equipoNumero,
 *            hitoNumero, respuestas: { clave: {indice} | {otro: true, texto, color} } }
 * referencia: { equipos, hitos, preguntas }
 */
function prepararTutoria(entrada, referencia) {
  var errores = [];
  var tutores = {};
  ['conduce', 'registra'].forEach(function (rol) {
    var datos = (entrada && entrada[rol]) || {};
    var nombre = normalizarNombre(datos.nombre);
    var apellido = normalizarNombre(datos.apellido);
    var etiqueta = rol === 'conduce' ? 'quien conduce' : 'quien toma notas';
    if (!nombre || !apellido) errores.push('Falta el nombre o el apellido de ' + etiqueta + '.');
    if (nombre.length > MAXIMO_NOMBRE || apellido.length > MAXIMO_NOMBRE) {
      errores.push('El nombre de ' + etiqueta + ' es demasiado largo.');
    }
    tutores[rol] = { nombre: nombre, apellido: apellido };
  });
  if (
    tutores.conduce.nombre &&
    claveNombre(tutores.conduce.nombre + ' ' + tutores.conduce.apellido) ===
      claveNombre(tutores.registra.nombre + ' ' + tutores.registra.apellido)
  ) {
    errores.push('Quien conduce y quien toma notas deben ser personas distintas.');
  }

  var numero = Number(entrada && entrada.equipoNumero);
  var equipo = (referencia.equipos || []).filter(function (e) {
    return e.numero === numero;
  })[0];
  if (!equipo) errores.push('Elige un equipo de la lista.');

  var hito = null;
  if (equipo) {
    var numeroHito = Number(entrada.hitoNumero);
    hito = hitosDelCurso(referencia.hitos, equipo.curso).filter(function (h) {
      return h.numero === numeroHito;
    })[0];
    if (!hito) errores.push('Elige el hito de la tutoría.');
  }

  var respuestas = [];
  if (equipo && hito) {
    var elegidas = (entrada && entrada.respuestas) || {};
    var guion = preguntasDelGuion(referencia.preguntas, equipo.curso, hito.numero);
    var claves = guion.map(function (p) {
      return p.clave;
    });
    Object.keys(elegidas).forEach(function (clave) {
      if (claves.indexOf(clave) === -1) errores.push('La pregunta ' + clave + ' no está en el guion.');
    });
    guion.forEach(function (pregunta) {
      var elegida = elegidas[pregunta.clave];
      if (!elegida) return;
      if (elegida.otro) {
        var texto = String(elegida.texto || '').replace(/\s+/g, ' ').trim();
        if (!texto || COLORES.indexOf(elegida.color) === -1) {
          errores.push('"Otro" necesita texto y color: ' + pregunta.texto);
          return;
        }
        if (texto.length > MAXIMO_RESPUESTA_PROPIA) {
          errores.push('La respuesta propia supera los ' + MAXIMO_RESPUESTA_PROPIA + ' caracteres.');
          return;
        }
        respuestas.push({
          dimension: pregunta.dimension,
          preguntaClave: pregunta.clave,
          preguntaTexto: pregunta.texto,
          respuestaTexto: texto,
          color: elegida.color,
          respuestaPropia: true
        });
        return;
      }
      var alternativa = pregunta.alternativas[Number(elegida.indice)];
      if (!alternativa) {
        errores.push('Alternativa inválida en: ' + pregunta.texto);
        return;
      }
      respuestas.push({
        dimension: pregunta.dimension,
        preguntaClave: pregunta.clave,
        preguntaTexto: pregunta.texto,
        respuestaTexto: alternativa.texto,
        color: alternativa.color,
        respuestaPropia: false
      });
    });
  }

  if (errores.length) return { errores: errores };
  return {
    errores: [],
    tutoria: {
      semestre: equipo.semestre,
      equipoNumero: equipo.numero,
      equipoProyecto: equipo.nombre,
      curso: equipo.curso,
      hitoNumero: hito.numero,
      hitoNombre: hito.nombre,
      conduceNombre: tutores.conduce.nombre,
      conduceApellido: tutores.conduce.apellido,
      registraNombre: tutores.registra.nombre,
      registraApellido: tutores.registra.apellido
    },
    respuestas: respuestas
  };
}

/** 'AAAA-MM-DD' -> 'DD{separador}MM{separador}AAAA'. */
function fechaLegible(fechaIso, separador) {
  var partes = String(fechaIso).split('-');
  if (partes.length !== 3) return String(fechaIso);
  return [partes[2], partes[1], partes[0]].join(separador);
}

/**
 * Contexto del acta desde la copia guardada.
 * contexto: { fecha 'AAAA-MM-DD', semestre, equipoNumero, equipoProyecto, curso, hitoNumero,
 *   hitoNombre, tutorConduce, tutorRegistra, integrantesPresentes: [texto],
 *   respuestasBanco: [{dimension, preguntaTexto, textoElegido, colorElegido, nota,
 *   respuestaPropia}], preguntasTutor: [{pregunta, respuesta}],
 *   consultasEquipo: [{preguntaEquipo, respuestaTutor}], compromisos: [{descripcion, responsable}] }
 */
function semaforoDelContexto(contexto) {
  return calcularSemaforo(
    (contexto.respuestasBanco || []).map(function (r) {
      return { dimension: r.dimension, color: r.colorElegido };
    })
  );
}

/** El prompt de la versión anterior (backend/app/logica/actas.py, armar_prompt), sin cambios. */
function armarPrompt(contexto, rubrica) {
  var semaforo = semaforoDelContexto(contexto);
  var lineasSemaforo = DIMENSIONES.map(function (d) {
    return '- ' + d + ' (' + NOMBRES_DIMENSION[d] + '): ' + (semaforo[d] || 'sin dato');
  }).join('\n');

  var respuestas =
    (contexto.respuestasBanco || [])
      .map(function (r) {
        return (
          '- [' + r.dimension + '] ' + r.preguntaTexto + ': ' + r.textoElegido +
          (r.respuestaPropia ? ' (respuesta propia del tutor, semaforo ' + r.colorElegido + ')' : '') +
          (r.nota ? ' (nota: ' + r.nota + ')' : '')
        );
      })
      .join('\n') || 'Ninguna';
  var preguntasTutor =
    (contexto.preguntasTutor || [])
      .map(function (p) {
        return '- Pregunta: ' + p.pregunta + ' / Respuesta: ' + (p.respuesta || '(no se registro respuesta)');
      })
      .join('\n') || 'Ninguna';
  var consultas =
    (contexto.consultasEquipo || [])
      .map(function (c) {
        return '- Consulta: ' + c.preguntaEquipo + ' / Respuesta: ' + (c.respuestaTutor || '(no se registro respuesta)');
      })
      .join('\n') || 'Ninguna';
  var compromisos =
    (contexto.compromisos || [])
      .map(function (c) {
        return '- ' + c.descripcion + ' (responsable: ' + ETIQUETAS_RESPONSABLE[c.responsable] + ')';
      })
      .join('\n') || 'Ninguno';

  var bloqueRubrica = '';
  var reglaRubrica = '';
  if (rubrica) {
    bloqueRubrica =
      '\nRubrica del curso para este hito (SOLO como referencia de vocabulario y encuadre; no\n' +
      'describe lo que hizo este equipo):\n<<<\n' + rubrica + '\n>>>\n';
    reglaRubrica =
      '- La rubrica sirve solo para elegir el vocabulario y el encuadre de las\n' +
      '  observaciones (por ejemplo, nombrar un criterio que el registro si menciona). NUNCA\n' +
      '  afirmes a partir de ella hechos que no esten en los datos de la sesion: si la rubrica\n' +
      '  pide algo que el registro no menciona, no digas que el equipo lo hizo ni que no lo hizo.\n';
  }

  return (
    'Eres un asistente que redacta la seccion "Observaciones generales de la\n' +
    'reunion" de la minuta de una tutoria de un programa de innovacion universitario.\n\n' +
    'Datos de la sesion:\n' +
    '- Equipo ' + contexto.equipoNumero + ': ' + contexto.equipoProyecto + ' (' + contexto.curso + ')\n' +
    '- ' + contexto.hitoNombre + '\n' +
    '- Fecha: ' + fechaLegible(contexto.fecha, '-') + '\n\n' +
    'Estado por dimension (semaforo calculado, no lo cambies):\n' + lineasSemaforo + '\n\n' +
    'Respuestas del guion estandar:\n' + respuestas + '\n\n' +
    'Preguntas que hizo el tutor y lo que respondio el equipo:\n' + preguntasTutor + '\n\n' +
    'Consultas que hizo el equipo y lo que respondio el tutor:\n' + consultas + '\n\n' +
    'Compromisos:\n' + compromisos + '\n' +
    bloqueRubrica +
    '\nInstrucciones:\n' +
    '- Escribe solo las observaciones generales: de 3 a 6 vinetas que empiecen con "- ",\n' +
    '  en espanol, en el tono de una minuta de seguimiento (estado del equipo, preocupaciones,\n' +
    '  logros, sugerencias).\n' +
    '- Condensa el texto libre sin eliminar contenido sustantivo y sin agregar nada que no\n' +
    '  este en los datos. No menciones integrantes ni hechos que no aparezcan arriba.\n' +
    '- No asignes ni cambies colores de semaforo.\n' +
    reglaRubrica +
    '- Maximo ' + MAXIMO_PALABRAS_OBSERVACIONES + ' palabras. Sin encabezados ni titulos.\n'
  );
}

/** Observaciones sin modelo de lenguaje: deterministas y literales. */
function armarObservacionesRespaldo(contexto) {
  var semaforo = semaforoDelContexto(contexto);
  var conColor = function (color) {
    return DIMENSIONES.filter(function (d) {
      return semaforo[d] === color;
    });
  };
  var lineas = [];
  if (!(contexto.respuestasBanco || []).length) {
    lineas.push('- No se registraron respuestas del guion estandar.');
  }
  if (conColor('rojo').length) lineas.push('- Dimensiones en rojo: ' + conColor('rojo').join(', ') + '.');
  if (conColor('amarillo').length) {
    lineas.push('- Dimensiones en amarillo: ' + conColor('amarillo').join(', ') + '.');
  }
  if (conColor('verde').length) lineas.push('- Dimensiones en verde: ' + conColor('verde').join(', ') + '.');
  (contexto.respuestasBanco || []).forEach(function (r) {
    if (r.nota) lineas.push('- ' + r.dimension + ': ' + r.nota);
  });
  if ((contexto.consultasEquipo || []).length) {
    lineas.push('- El equipo hizo ' + contexto.consultasEquipo.length + ' consulta(s).');
  }
  if ((contexto.compromisos || []).length) {
    lineas.push('- Se acordaron ' + contexto.compromisos.length + ' compromiso(s).');
  } else {
    lineas.push('- No se acordaron compromisos.');
  }
  return lineas.join('\n');
}

/** 'cuota', 'transitorio' u 'otro', según el código HTTP y el cuerpo de la respuesta. */
function clasificarErrorGemini(codigo, cuerpo) {
  if (codigo === 429 || String(cuerpo || '').indexOf('RESOURCE_EXHAUSTED') !== -1) return 'cuota';
  if (codigo >= 500 && codigo < 600) return 'transitorio';
  return 'otro';
}

/** Texto de una respuesta de generateContent (sin las partes de razonamiento), o ''. */
function textoDeRespuestaGemini(cuerpo) {
  var datos;
  try {
    datos = typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo;
  } catch (error) {
    return '';
  }
  var candidato = datos && datos.candidates && datos.candidates[0];
  var partes = (candidato && candidato.content && candidato.content.parts) || [];
  return partes
    .filter(function (parte) {
      return parte && typeof parte.text === 'string' && !parte.thought;
    })
    .map(function (parte) {
      return parte.text;
    })
    .join('')
    .trim();
}

/**
 * Cascada de modelos. `llamar(modelo, prompt)` devuelve {codigo, cuerpo} o lanza un error de
 * red. Cuota: pasa al siguiente modelo de inmediato. Transitorio (red, 5xx): reintenta el mismo
 * con espera creciente (1 s, 2 s) y luego baja. Otro error o respuesta vacía: baja sin reintentar.
 * Devuelve { texto, modelo, bitacora }; texto y modelo quedan en null si se agota la lista.
 */
function generarConCascada(opciones) {
  var modelos = opciones.modelos || MODELOS_GEMINI;
  var esperar = opciones.esperar || function () {};
  var ahora = opciones.ahora || function () {
    return Date.now();
  };
  var presupuesto = opciones.presupuestoMs || PRESUPUESTO_CASCADA_MS;
  var bitacora = [];
  if (!opciones.clave) {
    bitacora.push('Sin CLAVE_API_GEMINI: se usa la plantilla sin IA.');
    return { texto: null, modelo: null, bitacora: bitacora };
  }
  var inicio = ahora();
  for (var posicion = 0; posicion < modelos.length; posicion++) {
    var modelo = modelos[posicion];
    var siguiente = modelos[posicion + 1] || 'plantilla sin IA';
    for (var intento = 1; intento <= INTENTOS_POR_MODELO; intento++) {
      if (ahora() - inicio > presupuesto) {
        bitacora.push('Se agotó el tiempo de la cascada: se usa la plantilla sin IA.');
        return { texto: null, modelo: null, bitacora: bitacora };
      }
      var tipo;
      var detalle;
      try {
        var respuesta = opciones.llamar(modelo, opciones.prompt);
        if (respuesta.codigo === 200) {
          var texto = textoDeRespuestaGemini(respuesta.cuerpo);
          if (texto) {
            bitacora.push('Redactó ' + modelo + ' (intento ' + intento + ', nivel ' + (posicion + 1) + ').');
            return { texto: texto, modelo: modelo, bitacora: bitacora };
          }
          tipo = 'otro';
          detalle = 'respuesta vacía';
        } else {
          tipo = clasificarErrorGemini(respuesta.codigo, respuesta.cuerpo);
          detalle = 'HTTP ' + respuesta.codigo;
        }
      } catch (error) {
        tipo = 'transitorio';
        detalle = String((error && error.message) || error);
      }
      if (tipo === 'transitorio' && intento < INTENTOS_POR_MODELO) {
        var espera = ESPERA_BASE_MS * Math.pow(2, intento - 1);
        bitacora.push('Fallo transitorio de ' + modelo + ' (' + detalle + '), reintento en ' + espera / 1000 + ' s.');
        esperar(espera);
        continue;
      }
      var motivo = {
        cuota: 'cuota agotada o límite',
        transitorio: 'fallo transitorio tras ' + INTENTOS_POR_MODELO + ' intentos',
        otro: 'error no recuperable'
      }[tipo];
      bitacora.push('Se baja de ' + modelo + ' a ' + siguiente + ': ' + motivo + ' (' + detalle + ').');
      break;
    }
  }
  return { texto: null, modelo: null, bitacora: bitacora };
}

// --- Minuta (estructura de backend/app/logica/documento_acta.py) ---------------------------

var TITULO_MINUTA = 'Minuta de Seguimiento';
var SECCIONES_MINUTA = [
  '1. Información General',
  '2. Consultas y Respuestas',
  '3. Observaciones Generales de la Reunión',
  '4. Estado por Dimensión',
  '5. Consultas del Equipo',
  '6. Compromisos'
];
var ROTULOS_INFORMACION = [
  'Fecha de la reunión:',
  'Tutores presentes:',
  'Grupo N°:',
  'Proyecto:',
  'Integrantes presentes:'
];
var SIN_DATO = 'Sin dato';

/** Una viñeta por línea no vacía, sin el guion o asterisco con que la escribió el modelo. */
function lineasObservaciones(texto) {
  return String(texto || '')
    .split(/\r?\n/)
    .map(function (linea) {
      return linea.replace(/^\s*[-*•]\s*/, '').trim();
    })
    .filter(function (linea) {
      return linea;
    });
}

function textoRespuestaBanco(respuesta) {
  var texto = respuesta.textoElegido;
  if (respuesta.respuestaPropia) {
    texto += ' (respuesta propia; semáforo: ' + ETIQUETAS_SEMAFORO[respuesta.colorElegido] + ')';
  }
  return respuesta.nota ? texto + '. Nota: ' + respuesta.nota : texto;
}

/**
 * Bloques del documento, en orden: {tipo: 'titulo'|'parrafo'|'encabezado', texto},
 * {tipo: 'tabla', filas: [[izq, der]], conEncabezado} o {tipo: 'vinetas', lineas}.
 * La columna izquierda de cada tabla va en negrita; con conEncabezado, también la primera fila.
 */
function armarMinuta(contexto, observaciones) {
  var semaforo = semaforoDelContexto(contexto);
  var bloques = [
    { tipo: 'titulo', texto: TITULO_MINUTA },
    { tipo: 'parrafo', texto: contexto.curso + ' - ' + contexto.hitoNombre },
    { tipo: 'encabezado', texto: SECCIONES_MINUTA[0] }
  ];
  var informacion = [
    fechaLegible(contexto.fecha, '/'),
    'Conduce: ' + contexto.tutorConduce + '; Registra: ' + contexto.tutorRegistra,
    String(contexto.equipoNumero),
    contexto.equipoProyecto,
    (contexto.integrantesPresentes || []).join(', ') || SIN_DATO
  ];
  bloques.push({
    tipo: 'tabla',
    filas: ROTULOS_INFORMACION.map(function (rotulo, i) {
      return [rotulo, informacion[i]];
    }),
    conEncabezado: false
  });

  bloques.push({ tipo: 'encabezado', texto: SECCIONES_MINUTA[1] });
  var consultas = (contexto.respuestasBanco || [])
    .map(function (r) {
      return [r.preguntaTexto, textoRespuestaBanco(r)];
    })
    .concat(
      (contexto.preguntasTutor || []).map(function (p) {
        return [p.pregunta, p.respuesta || ''];
      })
    );
  if (!consultas.length) bloques.push({ tipo: 'parrafo', texto: 'Sin consultas registradas.' });
  consultas.forEach(function (consulta, i) {
    bloques.push({
      tipo: 'tabla',
      filas: [['Consulta ' + (i + 1), ''], ['Pregunta', consulta[0]], ['Respuesta', consulta[1]]],
      conEncabezado: true
    });
    bloques.push({ tipo: 'parrafo', texto: '' });
  });

  bloques.push({ tipo: 'encabezado', texto: SECCIONES_MINUTA[2] });
  var lineas = lineasObservaciones(observaciones);
  bloques.push({ tipo: 'vinetas', lineas: lineas.length ? lineas : [''] });

  bloques.push({ tipo: 'encabezado', texto: SECCIONES_MINUTA[3] });
  bloques.push({
    tipo: 'tabla',
    filas: [['Dimensión', 'Semáforo']].concat(
      DIMENSIONES.map(function (d) {
        return [d + ' — ' + NOMBRES_DIMENSION[d], semaforo[d] ? ETIQUETAS_SEMAFORO[semaforo[d]] : SIN_DATO];
      })
    ),
    conEncabezado: true
  });

  bloques.push({ tipo: 'encabezado', texto: SECCIONES_MINUTA[4] });
  if ((contexto.consultasEquipo || []).length) {
    bloques.push({
      tipo: 'tabla',
      filas: [['Consulta del equipo', 'Respuesta del tutor']].concat(
        contexto.consultasEquipo.map(function (c) {
          return [c.preguntaEquipo, c.respuestaTutor || ''];
        })
      ),
      conEncabezado: true
    });
  } else {
    bloques.push({ tipo: 'parrafo', texto: 'Sin consultas del equipo.' });
  }

  bloques.push({ tipo: 'encabezado', texto: SECCIONES_MINUTA[5] });
  if ((contexto.compromisos || []).length) {
    bloques.push({
      tipo: 'tabla',
      filas: [['Compromiso', 'Responsable']].concat(
        contexto.compromisos.map(function (c) {
          return [c.descripcion, ETIQUETAS_RESPONSABLE[c.responsable]];
        })
      ),
      conEncabezado: true
    });
  } else {
    bloques.push({ tipo: 'parrafo', texto: 'Sin compromisos.' });
  }
  return bloques;
}

function limpiarParaArchivo(texto) {
  return String(texto || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** {curso}_Equipo{numero}_{hito}_{AAAA-MM-DD}.docx */
function nombreArchivoActa(contexto, extension) {
  return (
    limpiarParaArchivo(contexto.curso) + '_Equipo' + contexto.equipoNumero + '_' +
    (limpiarParaArchivo(contexto.hitoNombre) || 'SinHito') + '_' + contexto.fecha + '.' +
    (extension || 'docx')
  );
}

// ===========================================================================================
// 2. Apps Script: planilla
// ===========================================================================================

var ZONA_HORARIA = 'America/Santiago';
var NUMERO_ALTERNATIVAS = 5;

var COLUMNAS = {
  Equipos: ['semestre', 'numero', 'nombre_proyecto', 'curso', 'descripcion'],
  Hitos: ['semestre', 'curso', 'numero', 'nombre', 'fecha'],
  Preguntas: ['clave', 'vigencia', 'curso', 'hito_numero', 'dimension', 'texto', 'fuente', 'activa'].concat(
    (function () {
      var columnas = [];
      for (var i = 1; i <= NUMERO_ALTERNATIVAS; i++) {
        columnas.push('alternativa_' + i + '_texto', 'alternativa_' + i + '_color');
      }
      return columnas;
    })()
  ),
  Tutorias: [
    'id', 'registrada_en', 'actualizada_en', 'fecha', 'semestre', 'equipo_numero', 'equipo_proyecto',
    'curso', 'hito_numero', 'hito_nombre', 'conduce_nombre', 'conduce_apellido', 'registra_nombre',
    'registra_apellido'
  ],
  Respuestas: [
    'id', 'tutoria_id', 'orden', 'dimension', 'pregunta_clave', 'pregunta_texto', 'respuesta_texto',
    'color', 'respuesta_propia'
  ],
  Actas: [
    'tutoria_id', 'estado', 'generado_con_ia', 'modelo_ia', 'contenido_generado', 'contenido_final',
    'documento_id', 'documento_url', 'nombre_archivo', 'generada_en', 'aprobada_en'
  ]
};

// Columnas que se guardan como texto, para que la planilla no convierta fechas ni números.
var COLUMNAS_TEXTO = {
  Hitos: ['fecha'],
  Tutorias: ['id', 'registrada_en', 'actualizada_en', 'fecha'],
  Respuestas: ['id', 'tutoria_id'],
  Actas: ['tutoria_id', 'generada_en', 'aprobada_en']
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Copiloto')
    .addItem('Configurar planilla', 'configurarPlanilla')
    .addToUi();
}

/** Crea las pestañas y siembra equipos, hitos y banco. Se puede correr de nuevo sin duplicar. */
function configurarPlanilla() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  // La aplicación web la abre por id si no hay planilla activa.
  PropertiesService.getScriptProperties().setProperty('ID_PLANILLA', libro.getId());
  var bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);
  try {
    Object.keys(COLUMNAS).forEach(function (nombre) {
      prepararHoja(libro, nombre);
    });
    var agregados = {
      Equipos: sembrar(libro, 'Equipos', EQUIPOS_EJEMPLO.equipos.map(function (e) {
        return [EQUIPOS_EJEMPLO.semestre, e.numero, e.nombre, e.curso, e.descripcion || ''];
      }), [0, 1]),
      Hitos: sembrar(libro, 'Hitos', HITOS_EJEMPLO.hitos.map(function (h) {
        return [HITOS_EJEMPLO.semestre, h.curso, h.numero, h.nombre, h.fecha];
      }), [0, 1, 2]),
      Preguntas: sembrar(libro, 'Preguntas', BANCO_PREGUNTAS.preguntas.map(function (p) {
        var fila = [p.clave, BANCO_PREGUNTAS.vigencia, p.curso, p.hito_numero === null ? '' : p.hito_numero,
          p.dimension, p.texto, p.fuente || '', 'SI'];
        for (var i = 0; i < NUMERO_ALTERNATIVAS; i++) {
          var alternativa = p.alternativas[i];
          fila.push(alternativa ? alternativa.texto : '', alternativa ? alternativa.color : '');
        }
        return fila;
      }), [0])
    };
    var hojaInicial = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
    if (hojaInicial && hojaInicial.getLastRow() === 0 && libro.getSheets().length > 1) {
      libro.deleteSheet(hojaInicial);
    }
    obtenerCarpetaActas();
    var resumen = 'Planilla lista. Filas nuevas: ' + agregados.Equipos + ' equipos, ' + agregados.Hitos +
      ' hitos, ' + agregados.Preguntas + ' preguntas.';
    Logger.log(resumen);
    return resumen;
  } finally {
    bloqueo.releaseLock();
  }
}

function prepararHoja(libro, nombre) {
  var pestana = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  var columnas = COLUMNAS[nombre];
  var actuales = pestana.getLastColumn()
    ? pestana.getRange(1, 1, 1, pestana.getLastColumn()).getDisplayValues()[0]
    : [];
  // Agrega solo los encabezados que falten, sin mover columnas que alguien ya haya usado.
  columnas.forEach(function (columna) {
    if (actuales.indexOf(columna) === -1) {
      actuales.push(columna);
      pestana.getRange(1, actuales.length).setValue(columna);
    }
  });
  pestana.getRange(1, 1, 1, actuales.length).setFontWeight('bold');
  pestana.setFrozenRows(1);
  (COLUMNAS_TEXTO[nombre] || []).forEach(function (columna) {
    pestana.getRange(2, actuales.indexOf(columna) + 1, pestana.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  return pestana;
}

/** Agrega las filas cuya clave (columnas `indicesClave`) no esté ya en la hoja. */
function sembrar(libro, nombre, filas, indicesClave) {
  var existentes = leerHoja(nombre);
  var columnas = COLUMNAS[nombre];
  var clave = function (valores) {
    return indicesClave.map(function (i) {
      return String(valores[i]);
    }).join('|');
  };
  var vistas = {};
  existentes.forEach(function (registro) {
    vistas[clave(columnas.map(function (c) {
      return registro[c];
    }))] = true;
  });
  var nuevas = filas.filter(function (fila) {
    var k = clave(fila);
    if (vistas[k]) return false;
    vistas[k] = true;
    return true;
  });
  agregarFilas(nombre, nuevas.map(function (fila) {
    return objetoDesdeFila(columnas, fila);
  }));
  return nuevas.length;
}

function objetoDesdeFila(columnas, fila) {
  var objeto = {};
  columnas.forEach(function (columna, i) {
    objeto[columna] = fila[i];
  });
  return objeto;
}

function libroDatos() {
  var activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;
  var id = PropertiesService.getScriptProperties().getProperty('ID_PLANILLA');
  if (!id) throw new Error('No se encontró la planilla. Corre configurarPlanilla desde el editor.');
  return SpreadsheetApp.openById(id);
}

function hoja(nombre) {
  var encontrada = libroDatos().getSheetByName(nombre);
  if (!encontrada) throw new Error('Falta la pestaña "' + nombre + '". Corre configurarPlanilla.');
  return encontrada;
}

function encabezados(nombre) {
  var h = hoja(nombre);
  return h.getRange(1, 1, 1, h.getLastColumn()).getDisplayValues()[0];
}

/** Filas como objetos {columna: texto}, con su número de fila en `_fila`. Todo como texto. */
function leerHoja(nombre) {
  var h = hoja(nombre);
  var ultima = h.getLastRow();
  if (ultima < 2) return [];
  var columnas = encabezados(nombre);
  return h.getRange(2, 1, ultima - 1, columnas.length).getDisplayValues().map(function (fila, i) {
    var objeto = { _fila: i + 2 };
    columnas.forEach(function (columna, j) {
      objeto[columna] = fila[j].trim();
    });
    return objeto;
  });
}

/**
 * Escribe objetos {columna: valor} desde `numeroFila`, en una sola llamada. Agrega filas a la
 * pestaña si hace falta y deja como texto las columnas de COLUMNAS_TEXTO, para que la planilla
 * no convierta fechas ni identificadores.
 */
function escribirFilas(nombre, numeroFila, objetos) {
  if (!objetos.length) return;
  var pestana = hoja(nombre);
  var columnas = encabezados(nombre);
  var faltan = numeroFila + objetos.length - 1 - pestana.getMaxRows();
  if (faltan > 0) pestana.insertRowsAfter(pestana.getMaxRows(), faltan);
  (COLUMNAS_TEXTO[nombre] || []).forEach(function (columna) {
    var indice = columnas.indexOf(columna);
    if (indice !== -1) pestana.getRange(numeroFila, indice + 1, objetos.length, 1).setNumberFormat('@');
  });
  pestana.getRange(numeroFila, 1, objetos.length, columnas.length).setValues(objetos.map(function (objeto) {
    return columnas.map(function (columna) {
      return objeto[columna] === undefined || objeto[columna] === null ? '' : objeto[columna];
    });
  }));
}

function agregarFilas(nombre, objetos) {
  escribirFilas(nombre, hoja(nombre).getLastRow() + 1, objetos);
}

function agregarFila(nombre, objeto) {
  agregarFilas(nombre, [objeto]);
}

function escribirFila(nombre, numeroFila, objeto) {
  escribirFilas(nombre, numeroFila, [objeto]);
}

function ahoraEnChile(formato) {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, formato || 'yyyy-MM-dd HH:mm:ss');
}

/** Equipos, hitos y preguntas leídos de la planilla, con los tipos que esperan las funciones puras. */
function leerReferencia() {
  var equipos = leerHoja('Equipos').filter(function (e) {
    return e.numero && e.nombre_proyecto && e.curso;
  }).map(function (e) {
    return { semestre: e.semestre, numero: Number(e.numero), nombre: e.nombre_proyecto, curso: e.curso,
      descripcion: e.descripcion };
  }).sort(function (a, b) {
    return a.numero - b.numero;
  });
  var hitos = leerHoja('Hitos').filter(function (h) {
    return h.curso && h.numero && h.nombre;
  }).map(function (h) {
    return { semestre: h.semestre, curso: h.curso, numero: Number(h.numero), nombre: h.nombre, fecha: h.fecha };
  });
  var preguntas = leerHoja('Preguntas').filter(function (p) {
    return p.clave && p.texto && DIMENSIONES.indexOf(p.dimension) !== -1;
  }).map(function (p) {
    var alternativas = [];
    for (var i = 1; i <= NUMERO_ALTERNATIVAS; i++) {
      var texto = p['alternativa_' + i + '_texto'];
      var color = String(p['alternativa_' + i + '_color'] || '').toLowerCase();
      if (texto && COLORES.indexOf(color) !== -1) alternativas.push({ texto: texto, color: color });
    }
    return {
      clave: p.clave, curso: p.curso, hito_numero: p.hito_numero === '' ? null : Number(p.hito_numero),
      dimension: p.dimension, texto: p.texto, alternativas: alternativas,
      activa: String(p.activa).toUpperCase() !== 'NO'
    };
  }).filter(function (p) {
    return p.alternativas.length >= 2;
  });
  return { equipos: equipos, hitos: hitos, preguntas: preguntas };
}

// ===========================================================================================
// 3. Apps Script: aplicación web
// ===========================================================================================

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Copiloto de Tutorías · Impulsa DIE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function incluir(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/** Lo que necesita la página al abrir: equipos, hitos por curso (con el sugerido) y guiones. */
function obtenerDatosIniciales() {
  var referencia = leerReferencia();
  var hoy = ahoraEnChile('yyyy-MM-dd');
  var hitosPorCurso = {};
  var guiones = {};
  referencia.equipos.forEach(function (equipo) {
    if (hitosPorCurso[equipo.curso]) return;
    var hitos = hitosDelCurso(referencia.hitos, equipo.curso);
    var sugerido = hitoSugerido(hitos, hoy);
    hitosPorCurso[equipo.curso] = { hitos: hitos, sugerido: sugerido ? sugerido.numero : null };
    hitos.forEach(function (hito) {
      guiones[equipo.curso + '|' + hito.numero] = preguntasDelGuion(referencia.preguntas, equipo.curso, hito.numero)
        .map(function (p) {
          return { clave: p.clave, dimension: p.dimension, texto: p.texto, alternativas: p.alternativas };
        });
    });
  });
  var semestres = referencia.equipos.map(function (e) {
    return e.semestre;
  });
  return {
    semestre: semestres.length ? semestres[0] : '',
    hoy: hoy,
    equipos: referencia.equipos,
    hitosPorCurso: hitosPorCurso,
    guiones: guiones,
    dimensiones: DIMENSIONES.map(function (d) {
      return { codigo: d, nombre: NOMBRES_DIMENSION[d] };
    })
  };
}

function conBloqueo(funcion) {
  var bloqueo = LockService.getScriptLock();
  if (!bloqueo.tryLock(30000)) throw new Error('La planilla está ocupada. Intenta de nuevo en unos segundos.');
  try {
    return funcion();
  } finally {
    bloqueo.releaseLock();
  }
}

function buscarActa(tutoriaId) {
  return leerHoja('Actas').filter(function (a) {
    return a.tutoria_id === tutoriaId;
  })[0] || null;
}

/**
 * Guarda una tutoría: una fila en Tutorias y una por respuesta en Respuestas. Con `entrada.id`
 * de una tutoría existente (sin acta aprobada) la reemplaza. Devuelve el id y el semáforo.
 */
function guardarTutoria(entrada) {
  var preparada = prepararTutoria(entrada, leerReferencia());
  if (preparada.errores.length) throw new Error(preparada.errores.join(' '));

  return conBloqueo(function () {
    var ahora = ahoraEnChile();
    var id = entrada.id || Utilities.getUuid();
    var existente = entrada.id ? leerHoja('Tutorias').filter(function (t) {
      return t.id === entrada.id;
    })[0] : null;
    if (entrada.id && !existente) throw new Error('No se encontró la tutoría ' + entrada.id + ' en la planilla.');
    var acta = existente ? buscarActa(id) : null;
    if (acta && acta.estado === 'aprobada') {
      throw new Error('Esta tutoría ya tiene el acta aprobada y no se puede cambiar.');
    }

    var t = preparada.tutoria;
    var fila = {
      id: id,
      registrada_en: existente ? existente.registrada_en : ahora,
      actualizada_en: ahora,
      fecha: existente ? existente.fecha : ahora.slice(0, 10),
      semestre: t.semestre,
      equipo_numero: t.equipoNumero,
      equipo_proyecto: t.equipoProyecto,
      curso: t.curso,
      hito_numero: t.hitoNumero,
      hito_nombre: t.hitoNombre,
      conduce_nombre: t.conduceNombre,
      conduce_apellido: t.conduceApellido,
      registra_nombre: t.registraNombre,
      registra_apellido: t.registraApellido
    };
    if (existente) {
      escribirFila('Tutorias', existente._fila, fila);
      borrarRespuestas(id);
    } else {
      agregarFila('Tutorias', fila);
    }
    agregarFilas('Respuestas', preparada.respuestas.map(function (r, i) {
      return {
        id: Utilities.getUuid(), tutoria_id: id, orden: i + 1, dimension: r.dimension,
        pregunta_clave: r.preguntaClave, pregunta_texto: r.preguntaTexto, respuesta_texto: r.respuestaTexto,
        color: r.color, respuesta_propia: r.respuestaPropia ? 'SI' : 'NO'
      };
    }));
    return { id: id, semaforo: calcularSemaforo(preparada.respuestas), respuestas: preparada.respuestas.length };
  });
}

function borrarRespuestas(tutoriaId) {
  var pestana = hoja('Respuestas');
  leerHoja('Respuestas').filter(function (r) {
    return r.tutoria_id === tutoriaId;
  }).map(function (r) {
    return r._fila;
  }).sort(function (a, b) {
    return b - a;
  }).forEach(function (numeroFila) {
    pestana.deleteRow(numeroFila);
  });
}

/** Contexto del acta desde la copia guardada en Tutorias y Respuestas. */
function contextoDesdePlanilla(tutoriaId) {
  var tutoria = leerHoja('Tutorias').filter(function (t) {
    return t.id === tutoriaId;
  })[0];
  if (!tutoria) throw new Error('No se encontró la tutoría ' + tutoriaId + ' en la planilla.');
  var respuestas = leerHoja('Respuestas').filter(function (r) {
    return r.tutoria_id === tutoriaId;
  }).sort(function (a, b) {
    return DIMENSIONES.indexOf(a.dimension) - DIMENSIONES.indexOf(b.dimension) || Number(a.orden) - Number(b.orden);
  });
  return {
    fecha: tutoria.fecha,
    semestre: tutoria.semestre,
    equipoNumero: Number(tutoria.equipo_numero),
    equipoProyecto: tutoria.equipo_proyecto,
    curso: tutoria.curso,
    hitoNumero: Number(tutoria.hito_numero),
    hitoNombre: tutoria.hito_nombre,
    tutorConduce: tutoria.conduce_nombre + ' ' + tutoria.conduce_apellido,
    tutorRegistra: tutoria.registra_nombre + ' ' + tutoria.registra_apellido,
    integrantesPresentes: [],
    respuestasBanco: respuestas.filter(function (r) {
      return COLORES.indexOf(r.color) !== -1;
    }).map(function (r) {
      return {
        dimension: r.dimension, preguntaTexto: r.pregunta_texto, textoElegido: r.respuesta_texto,
        colorElegido: r.color, nota: '', respuestaPropia: r.respuesta_propia === 'SI'
      };
    }),
    preguntasTutor: [],
    consultasEquipo: [],
    compromisos: []
  };
}

function llamarGemini(clave) {
  return function (modelo, prompt) {
    var respuesta = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelo) + ':generateContent',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': clave },
        payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        muteHttpExceptions: true
      }
    );
    return { codigo: respuesta.getResponseCode(), cuerpo: respuesta.getContentText() };
  };
}

/**
 * Redacta (o rehace) el borrador de "Observaciones generales". Nunca queda como definitivo:
 * el tutor lo revisa, lo edita y lo aprueba con aprobarActa.
 */
function generarActa(tutoriaId) {
  var contexto = contextoDesdePlanilla(tutoriaId);
  var acta = buscarActa(tutoriaId);
  if (acta && acta.estado === 'aprobada') {
    return { estado: 'aprobada', texto: acta.contenido_final, generadoConIa: acta.generado_con_ia === 'SI',
      modeloIa: acta.modelo_ia, documentoUrl: acta.documento_url, nombreArchivo: acta.nombre_archivo,
      bloques: armarMinuta(contexto, acta.contenido_final) };
  }
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE_API_GEMINI');
  var resultado = generarConCascada({
    prompt: armarPrompt(contexto, null),
    clave: clave,
    llamar: llamarGemini(clave),
    esperar: function (ms) {
      Utilities.sleep(ms);
    }
  });
  resultado.bitacora.forEach(function (linea) {
    console.log(linea);
  });
  var conIa = Boolean(resultado.texto);
  var texto = conIa ? resultado.texto : armarObservacionesRespaldo(contexto);

  return conBloqueo(function () {
    var actual = buscarActa(tutoriaId);
    if (actual && actual.estado === 'aprobada') throw new Error('El acta ya fue aprobada desde otro dispositivo.');
    var fila = {
      tutoria_id: tutoriaId, estado: 'borrador', generado_con_ia: conIa ? 'SI' : 'NO',
      modelo_ia: conIa ? resultado.modelo : '', contenido_generado: texto, contenido_final: '',
      documento_id: '', documento_url: '', nombre_archivo: '', generada_en: ahoraEnChile(), aprobada_en: ''
    };
    if (actual) escribirFila('Actas', actual._fila, fila);
    else agregarFila('Actas', fila);
    // La vista previa del navegador dibuja estos mismos bloques que irán al documento.
    return { estado: 'borrador', texto: texto, generadoConIa: conIa, modeloIa: fila.modelo_ia,
      bitacora: resultado.bitacora, bloques: armarMinuta(contexto, texto) };
  });
}

/** Aprueba el texto revisado por el tutor y crea el documento de Google en la carpeta de actas. */
function aprobarActa(tutoriaId, texto) {
  var limpio = String(texto || '').trim();
  if (!limpio) throw new Error('Las observaciones generales no pueden quedar vacías.');
  if (limpio.length > MAXIMO_OBSERVACIONES) {
    throw new Error('Las observaciones superan los ' + MAXIMO_OBSERVACIONES + ' caracteres.');
  }
  return conBloqueo(function () {
    var acta = buscarActa(tutoriaId);
    if (!acta) throw new Error('Primero genera el acta.');
    if (acta.estado === 'aprobada') {
      return { documentoUrl: acta.documento_url, nombreArchivo: acta.nombre_archivo };
    }
    var contexto = contextoDesdePlanilla(tutoriaId);
    var nombreArchivo = nombreArchivoActa(contexto, 'docx');
    var documento = DocumentApp.create(nombreArchivo.replace(/\.docx$/, ''));
    escribirMinuta(documento.getBody(), armarMinuta(contexto, limpio));
    documento.saveAndClose();
    DriveApp.getFileById(documento.getId()).moveTo(obtenerCarpetaActas());

    acta.estado = 'aprobada';
    acta.contenido_final = limpio;
    acta.documento_id = documento.getId();
    acta.documento_url = documento.getUrl();
    acta.nombre_archivo = nombreArchivo;
    acta.aprobada_en = ahoraEnChile();
    escribirFila('Actas', acta._fila, acta);
    return { documentoUrl: acta.documento_url, nombreArchivo: nombreArchivo };
  });
}

/**
 * El .docx del acta aprobada, en base64. Lo exporta el servidor con el permiso del propietario,
 * así que funciona para un tutor que no tiene acceso a la carpeta de actas.
 */
function descargarDocx(tutoriaId) {
  var acta = buscarActa(tutoriaId);
  if (!acta || acta.estado !== 'aprobada' || !acta.documento_id) {
    throw new Error('El acta todavía no está aprobada.');
  }
  var respuesta = UrlFetchApp.fetch(
    'https://docs.google.com/document/d/' + acta.documento_id + '/export?format=docx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
  );
  if (respuesta.getResponseCode() !== 200) {
    throw new Error('Google no entregó el .docx (HTTP ' + respuesta.getResponseCode() + ').');
  }
  return { nombreArchivo: acta.nombre_archivo, base64: Utilities.base64Encode(respuesta.getContent()) };
}

function obtenerCarpetaActas() {
  var propiedades = PropertiesService.getScriptProperties();
  var id = propiedades.getProperty('ID_CARPETA_ACTAS');
  if (id) {
    try {
      var carpeta = DriveApp.getFolderById(id);
      if (!carpeta.isTrashed()) return carpeta;
    } catch (error) {
      console.log('La carpeta ' + id + ' ya no existe; se crea otra.');
    }
  }
  var nueva = DriveApp.createFolder('Copiloto de Tutorías - Actas');
  propiedades.setProperty('ID_CARPETA_ACTAS', nueva.getId());
  return nueva;
}

function escribirMinuta(cuerpo, bloques) {
  var vacioInicial = cuerpo.getNumChildren() === 1 ? cuerpo.getChild(0) : null;
  bloques.forEach(function (bloque) {
    if (bloque.tipo === 'titulo') {
      cuerpo.appendParagraph(bloque.texto).setHeading(DocumentApp.ParagraphHeading.NORMAL).editAsText().setBold(true);
    } else if (bloque.tipo === 'encabezado') {
      cuerpo.appendParagraph(bloque.texto).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    } else if (bloque.tipo === 'parrafo') {
      var parrafo = cuerpo.appendParagraph(bloque.texto).setHeading(DocumentApp.ParagraphHeading.NORMAL);
      if (bloque.texto) parrafo.editAsText().setBold(false);
    } else if (bloque.tipo === 'vinetas') {
      bloque.lineas.forEach(function (linea) {
        var item = cuerpo.appendListItem(linea).setGlyphType(DocumentApp.GlyphType.BULLET);
        if (linea) item.editAsText().setBold(false);
      });
    } else if (bloque.tipo === 'tabla') {
      var tabla = cuerpo.appendTable(bloque.filas);
      for (var i = 0; i < tabla.getNumRows(); i++) {
        var fila = tabla.getRow(i);
        for (var j = 0; j < fila.getNumCells(); j++) {
          var celda = fila.getCell(j);
          if (celda.getText()) celda.editAsText().setBold(j === 0 || (bloque.conEncabezado && i === 0));
        }
      }
    }
  });
  if (vacioInicial && vacioInicial.getType() === DocumentApp.ElementType.PARAGRAPH && !vacioInicial.asText().getText()) {
    vacioInicial.removeFromParent();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    DIMENSIONES: DIMENSIONES,
    MODELOS_GEMINI: MODELOS_GEMINI,
    normalizarNombre: normalizarNombre,
    claveNombre: claveNombre,
    calcularSemaforo: calcularSemaforo,
    hitosDelCurso: hitosDelCurso,
    hitoSugerido: hitoSugerido,
    preguntasDelGuion: preguntasDelGuion,
    prepararTutoria: prepararTutoria,
    armarPrompt: armarPrompt,
    armarObservacionesRespaldo: armarObservacionesRespaldo,
    clasificarErrorGemini: clasificarErrorGemini,
    textoDeRespuestaGemini: textoDeRespuestaGemini,
    generarConCascada: generarConCascada,
    lineasObservaciones: lineasObservaciones,
    armarMinuta: armarMinuta,
    nombreArchivoActa: nombreArchivoActa
  };
}
