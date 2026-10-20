/**
 * Copiloto de Tutorías de Impulsa DIE: servidor de la aplicación web (Apps Script).
 *
 * El archivo tiene dos partes:
 * 1. Funciones puras (tutores y duplas, semáforo, guion, prompt, plantilla sin IA, cascada de
 *    Gemini, minuta, tablas de análisis, panel). No tocan ningún servicio de Google y se prueban con
 *    `node --test "pruebas/*.test.js"`.
 * 2. Funciones de Apps Script: planilla, aplicación web, Gemini por UrlFetchApp y acta en
 *    Google Docs.
 *
 * Los datos viven en la planilla (una pestaña por entidad). El acta se arma solo desde la
 * copia guardada en Tutorias, Respuestas, PreguntasTutor, ConsultasEquipo y Compromisos,
 * nunca desde el banco ni las pestañas de referencia vigentes.
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
// Valor numérico para Data Studio: el peor caso es el mínimo.
var VALOR_COLOR = { rojo: 1, amarillo: 2, verde: 3 };
var SIN_DATO_COLOR = 'sin dato';
var ETIQUETAS_SEMAFORO = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };
var ETIQUETAS_RESPONSABLE = { equipo: 'Equipo', tutores: 'Tutores' };
var RESPONSABLES = ['equipo', 'tutores'];

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
var MAXIMO_NOTA = 500;
var MAXIMO_TEXTO_LIBRE = 1000;
var MAXIMO_PARES = 20;
var MAXIMO_COMPROMISOS = 3;
var MAXIMO_INTEGRANTES = 20;
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

/** Colapsa espacios y saltos de línea: cada texto libre queda en una sola línea. */
function textoEnUnaLinea(texto) {
  return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
}

/**
 * Columnas `activo` y `activa`: vacío cuenta como activo; solo FALSE, FALSO, NO o 0 lo
 * desactivan. Acepta también los booleanos de una casilla de verificación.
 */
function estaActivo(valor) {
  var texto = String(valor == null ? '' : valor).trim().toUpperCase();
  return ['FALSE', 'FALSO', 'NO', '0'].indexOf(texto) === -1;
}

/** "Nombre Apellido" del tutor, o el alias si falta el nombre. */
function nombreVisibleTutor(tutor) {
  if (!textoEnUnaLinea(tutor.nombre)) return textoEnUnaLinea(tutor.alias);
  return textoEnUnaLinea(tutor.nombre + ' ' + (tutor.apellido || ''));
}

/** Integrantes separados por coma, sin vacíos ni repetidos. */
function separarIntegrantes(texto) {
  var vistos = {};
  return String(texto || '')
    .split(',')
    .map(textoEnUnaLinea)
    .filter(function (nombre) {
      var clave = claveNombre(nombre);
      if (!clave || vistos[clave]) return false;
      vistos[clave] = true;
      return true;
    });
}

/**
 * La dupla activa que forman dos tutores (por alias), en cualquier orden. Si el par aparece en
 * varios semestres, gana el más reciente. null si no forman una dupla registrada.
 * duplas: [{semestre, dupla, tutor_1, tutor_2, activa}]
 */
function buscarDupla(duplas, aliasA, aliasB) {
  var a = claveNombre(aliasA);
  var b = claveNombre(aliasB);
  if (!a || !b || a === b) return null;
  var encontradas = (duplas || []).filter(function (dupla) {
    if (!estaActivo(dupla.activa)) return false;
    var t1 = claveNombre(dupla.tutor_1);
    var t2 = claveNombre(dupla.tutor_2);
    return (t1 === a && t2 === b) || (t1 === b && t2 === a);
  });
  encontradas.sort(function (x, y) {
    return String(y.semestre).localeCompare(String(x.semestre));
  });
  return encontradas[0] || null;
}

/** Equipos activos asignados a la dupla, por número. */
function equiposDeLaDupla(equipos, dupla) {
  var clave = claveNombre(dupla && dupla.dupla);
  if (!clave) return [];
  return (equipos || [])
    .filter(function (equipo) {
      return estaActivo(equipo.activo) && claveNombre(equipo.dupla) === clave;
    })
    .sort(function (a, b) {
      return a.numero - b.numero;
    });
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

/** rojo = 1, amarillo = 2, verde = 3; '' si no es un color del semáforo. */
function valorColor(color) {
  return VALOR_COLOR[String(color || '').toLowerCase()] || '';
}

/** El peor de varios colores (el de menor valor), o '' si no hay ninguno válido. */
function peorColor(colores) {
  var peor = '';
  (colores || []).forEach(function (color) {
    var valor = valorColor(color);
    if (valor && (!peor || valor < VALOR_COLOR[peor])) peor = String(color).toLowerCase();
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
 * Quien conduce o quien toma notas: un tutor de la lista ({alias}) o uno escrito a mano
 * ({nombre, apellido}). Los de la lista se copian tal como están en la pestaña Tutores.
 */
function resolverTutor(eleccion, tutores, etiqueta) {
  eleccion = eleccion || {};
  if (eleccion.alias) {
    var clave = claveNombre(eleccion.alias);
    var tutor = (tutores || []).filter(function (t) {
      return estaActivo(t.activo) && claveNombre(t.alias) === clave;
    })[0];
    if (!tutor) return { error: 'Elige de la lista a ' + etiqueta + '.' };
    return {
      tutor: {
        alias: textoEnUnaLinea(tutor.alias),
        nombre: textoEnUnaLinea(tutor.nombre) || textoEnUnaLinea(tutor.alias),
        apellido: textoEnUnaLinea(tutor.apellido)
      }
    };
  }
  var nombre = normalizarNombre(eleccion.nombre);
  var apellido = normalizarNombre(eleccion.apellido);
  if (!nombre || !apellido) return { error: 'Falta el nombre o el apellido de ' + etiqueta + '.' };
  if (nombre.length > MAXIMO_NOMBRE || apellido.length > MAXIMO_NOMBRE) {
    return { error: 'El nombre de ' + etiqueta + ' es demasiado largo.' };
  }
  return { tutor: { alias: '', nombre: nombre, apellido: apellido } };
}

function mismoTutor(a, b) {
  if (a.alias && b.alias) return claveNombre(a.alias) === claveNombre(b.alias);
  return claveNombre(a.nombre + ' ' + a.apellido) === claveNombre(b.nombre + ' ' + b.apellido);
}

/** Pares de texto libre: descarta los vacíos y exige el primer campo si viene el segundo. */
function prepararPares(lista, campos, etiqueta, errores) {
  var pares = [];
  (lista || []).forEach(function (par, i) {
    var primero = textoEnUnaLinea(par && par[campos[0]]);
    var segundo = textoEnUnaLinea(par && par[campos[1]]);
    if (!primero && !segundo) return;
    if (!primero) {
      errores.push('Falta el texto de ' + etiqueta + ' ' + (i + 1) + '.');
      return;
    }
    if (primero.length > MAXIMO_TEXTO_LIBRE || segundo.length > MAXIMO_TEXTO_LIBRE) {
      errores.push('El texto de ' + etiqueta + ' ' + (i + 1) + ' supera los ' + MAXIMO_TEXTO_LIBRE + ' caracteres.');
      return;
    }
    var limpio = {};
    limpio[campos[0]] = primero;
    limpio[campos[1]] = segundo;
    pares.push(limpio);
  });
  if (pares.length > MAXIMO_PARES) errores.push('Se pueden registrar hasta ' + MAXIMO_PARES + ' de ' + etiqueta + '.');
  return pares;
}

/**
 * Valida lo que manda el navegador y arma la copia que se guarda. No confía en los textos del
 * cliente: tutor, equipo, pregunta, alternativa y color salen de la planilla; solo "Otro", las
 * notas, los integrantes agregados a mano, las preguntas del tutor, las consultas y los
 * compromisos traen texto propio.
 *
 * entrada: { conduce, registra: {alias} | {nombre, apellido}, equipoNumero, hitoNumero,
 *   integrantes: {lista: [nombre de la pestaña Equipos], otros: [{nombre, apellido}]},
 *   respuestas: { clave: {indice, nota} | {otro: true, texto, color, nota} },
 *   preguntasTutor: [{pregunta, respuesta}], consultas: [{preguntaEquipo, respuestaTutor}],
 *   compromisos: [{descripcion, responsable: 'equipo' | 'tutores'}] }
 * referencia: { tutores, equipos, hitos, preguntas }
 */
function prepararTutoria(entrada, referencia) {
  entrada = entrada || {};
  var errores = [];
  var tutores = {};
  ['conduce', 'registra'].forEach(function (rol) {
    var etiqueta = rol === 'conduce' ? 'quien conduce' : 'quien toma notas';
    var resultado = resolverTutor(entrada[rol], referencia.tutores, etiqueta);
    if (resultado.error) errores.push(resultado.error);
    tutores[rol] = resultado.tutor || null;
  });
  if (tutores.conduce && tutores.registra && mismoTutor(tutores.conduce, tutores.registra)) {
    errores.push('Quien conduce y quien toma notas deben ser personas distintas.');
  }

  var numero = Number(entrada.equipoNumero);
  var equipo = (referencia.equipos || []).filter(function (e) {
    return e.numero === numero && estaActivo(e.activo);
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

  var integrantes = [];
  if (equipo) {
    var vistos = {};
    var agregar = function (nombre) {
      var clave = claveNombre(nombre);
      if (vistos[clave]) return;
      vistos[clave] = true;
      integrantes.push(nombre);
    };
    var entradaIntegrantes = entrada.integrantes || {};
    (entradaIntegrantes.lista || []).forEach(function (nombre) {
      var delEquipo = (equipo.integrantes || []).filter(function (i) {
        return claveNombre(i) === claveNombre(nombre);
      })[0];
      if (delEquipo) agregar(delEquipo);
      else errores.push(textoEnUnaLinea(nombre) + ' no está en la lista de integrantes del equipo.');
    });
    (entradaIntegrantes.otros || []).forEach(function (otro) {
      var nombre = normalizarNombre(otro && otro.nombre);
      var apellido = normalizarNombre(otro && otro.apellido);
      if (!nombre || !apellido) {
        errores.push('Falta el nombre o el apellido de un integrante agregado.');
      } else if (nombre.length > MAXIMO_NOMBRE || apellido.length > MAXIMO_NOMBRE) {
        errores.push('El nombre de un integrante agregado es demasiado largo.');
      } else {
        agregar(nombre + ' ' + apellido);
      }
    });
    if (integrantes.length > MAXIMO_INTEGRANTES) {
      errores.push('Se pueden registrar hasta ' + MAXIMO_INTEGRANTES + ' integrantes presentes.');
    }
  }

  var respuestas = [];
  if (equipo && hito) {
    var elegidas = entrada.respuestas || {};
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
      var nota = textoEnUnaLinea(elegida.nota);
      if (nota.length > MAXIMO_NOTA) {
        errores.push('La observación supera los ' + MAXIMO_NOTA + ' caracteres: ' + pregunta.texto);
        return;
      }
      if (elegida.otro) {
        var texto = textoEnUnaLinea(elegida.texto);
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
          respuestaPropia: true,
          nota: nota
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
        respuestaPropia: false,
        nota: nota
      });
    });
  }

  var preguntasTutor = prepararPares(entrada.preguntasTutor, ['pregunta', 'respuesta'], 'la pregunta del tutor', errores);
  var consultas = prepararPares(entrada.consultas, ['preguntaEquipo', 'respuestaTutor'], 'la consulta del equipo', errores);

  var compromisos = [];
  (entrada.compromisos || []).forEach(function (compromiso, i) {
    var descripcion = textoEnUnaLinea(compromiso && compromiso.descripcion);
    var responsable = compromiso && compromiso.responsable;
    if (!descripcion && !responsable) return;
    if (!descripcion) errores.push('Falta la descripción del compromiso ' + (i + 1) + '.');
    else if (descripcion.length > MAXIMO_TEXTO_LIBRE) errores.push('El compromiso ' + (i + 1) + ' es demasiado largo.');
    if (RESPONSABLES.indexOf(responsable) === -1) errores.push('Elige el responsable del compromiso ' + (i + 1) + '.');
    compromisos.push({ descripcion: descripcion, responsable: responsable });
  });
  if (compromisos.length > MAXIMO_COMPROMISOS) {
    errores.push('Se pueden registrar hasta ' + MAXIMO_COMPROMISOS + ' compromisos.');
  }

  if (errores.length) return { errores: errores };
  return {
    errores: [],
    tutoria: {
      semestre: equipo.semestre,
      equipoNumero: equipo.numero,
      equipoProyecto: equipo.nombre,
      curso: equipo.curso,
      // La dupla del equipo (no la de los tutores): así todas las tablas filtran igual por dupla.
      dupla: equipo.dupla || '',
      hitoNumero: hito.numero,
      hitoNombre: hito.nombre,
      conduceNombre: tutores.conduce.nombre,
      conduceApellido: tutores.conduce.apellido,
      registraNombre: tutores.registra.nombre,
      registraApellido: tutores.registra.apellido,
      integrantesPresentes: integrantes
    },
    respuestas: respuestas,
    preguntasTutor: preguntasTutor,
    consultas: consultas,
    compromisos: compromisos
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

// --- Tablas de análisis para Data Studio ---------------------------------------------------

function claveEquipo(semestre, numero) {
  return String(semestre == null ? '' : semestre).trim() + '|' + Number(numero);
}

function numeroOVacio(texto) {
  var limpio = String(texto == null ? '' : texto).trim();
  return limpio === '' || isNaN(Number(limpio)) ? '' : Number(limpio);
}

/** Días entre dos fechas 'AAAA-MM-DD' (desde - hasta), o '' si alguna no es válida. */
function diasEntre(desde, hasta) {
  var fecha = function (texto) {
    var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || '').trim());
    return partes ? Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : null;
  };
  var a = fecha(desde);
  var b = fecha(hasta);
  if (a === null || b === null) return '';
  return Math.round((b - a) / 86400000);
}

/** Orden cronológico de las tutorías: fecha, luego hora de registro, luego id. */
function compararTutorias(a, b) {
  return (
    String(a.fecha).localeCompare(String(b.fecha)) ||
    String(a.registrada_en).localeCompare(String(b.registrada_en)) ||
    String(a.id).localeCompare(String(b.id))
  );
}

/**
 * Pestaña SemaforoDimensiones: una fila por tutoría y dimensión (seis por tutoría), con el
 * color de peor caso, su valor (rojo = 1, amarillo = 2, verde = 3; vacío si no hay dato), el
 * contexto de la tutoría y es_ultima_del_equipo (true solo en la tutoría más reciente de cada
 * equipo). Recibe las filas de Tutorias, Respuestas y Actas tal como se leen de la planilla.
 */
function filasSemaforoDimensiones(tutorias, respuestas, actas) {
  var porTutoria = {};
  (respuestas || []).forEach(function (r) {
    (porTutoria[r.tutoria_id] = porTutoria[r.tutoria_id] || []).push({
      dimension: r.dimension,
      color: String(r.color || '').toLowerCase()
    });
  });
  var aprobadas = {};
  (actas || []).forEach(function (a) {
    if (a.estado === 'aprobada') aprobadas[a.tutoria_id] = true;
  });
  var validas = (tutorias || []).filter(function (t) {
    return t.id;
  }).sort(compararTutorias);
  var ultima = {};
  validas.forEach(function (t) {
    ultima[claveEquipo(t.semestre, t.equipo_numero)] = t.id;
  });

  var filas = [];
  validas.forEach(function (t) {
    var semaforo = calcularSemaforo(porTutoria[t.id] || []);
    DIMENSIONES.forEach(function (dimension) {
      var color = semaforo[dimension] || '';
      filas.push({
        tutoria_id: t.id,
        fecha: t.fecha,
        semestre: t.semestre,
        curso: t.curso,
        equipo_numero: numeroOVacio(t.equipo_numero),
        equipo_proyecto: t.equipo_proyecto,
        dupla: t.dupla || '',
        hito_numero: numeroOVacio(t.hito_numero),
        hito_nombre: t.hito_nombre,
        conduce: textoEnUnaLinea((t.conduce_nombre || '') + ' ' + (t.conduce_apellido || '')),
        registra: textoEnUnaLinea((t.registra_nombre || '') + ' ' + (t.registra_apellido || '')),
        acta_estado: aprobadas[t.id] ? 'aprobada' : 'pendiente',
        dimension: dimension,
        dimension_nombre: NOMBRES_DIMENSION[dimension],
        color: color || SIN_DATO_COLOR,
        valor: valorColor(color),
        es_ultima_del_equipo: ultima[claveEquipo(t.semestre, t.equipo_numero)] === t.id
      });
    });
  });
  return filas;
}

/**
 * Pestaña EstadoEquipos: una fila por equipo activo, con su dupla y curso, cuántas tutorías
 * tiene, la fecha de la última y los días desde entonces, el color de cada dimensión en la
 * última tutoría y el peor color de todas. `filasSemaforo` sale de filasSemaforoDimensiones.
 */
function filasEstadoEquipos(equipos, filasSemaforo, hoy) {
  var porEquipo = {};
  (filasSemaforo || []).forEach(function (fila) {
    var clave = claveEquipo(fila.semestre, fila.equipo_numero);
    var datos = (porEquipo[clave] = porEquipo[clave] || { tutorias: {}, ultimas: [] });
    datos.tutorias[fila.tutoria_id] = true;
    if (fila.es_ultima_del_equipo) datos.ultimas.push(fila);
  });
  return (equipos || [])
    .filter(function (equipo) {
      return estaActivo(equipo.activo);
    })
    .sort(function (a, b) {
      return a.numero - b.numero;
    })
    .map(function (equipo) {
      var datos = porEquipo[claveEquipo(equipo.semestre, equipo.numero)] || { tutorias: {}, ultimas: [] };
      var colores = {};
      datos.ultimas.forEach(function (fila) {
        colores[fila.dimension] = fila.color;
      });
      var ultimaFecha = datos.ultimas.length ? datos.ultimas[0].fecha : '';
      var peor = peorColor(DIMENSIONES.map(function (d) {
        return colores[d];
      }));
      var fila = {
        semestre: equipo.semestre,
        equipo_numero: equipo.numero,
        equipo_proyecto: equipo.nombre,
        curso: equipo.curso,
        dupla: equipo.dupla || '',
        tutorias: Object.keys(datos.tutorias).length,
        ultima_fecha: ultimaFecha,
        dias_desde_ultima: ultimaFecha ? diasEntre(ultimaFecha, hoy) : ''
      };
      DIMENSIONES.forEach(function (d) {
        fila['color_' + d.toLowerCase()] = colores[d] || SIN_DATO_COLOR;
      });
      fila.peor_color = peor || SIN_DATO_COLOR;
      fila.peor_valor = valorColor(peor);
      return fila;
    });
}

// --- Panel de seguimiento ------------------------------------------------------------------

// "Sin tutoría reciente": la última tiene al menos estos días (o el equipo no tiene ninguna).
var DIAS_SIN_TUTORIA = 14;
var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Semana ISO 8601 de una fecha 'AAAA-MM-DD' (la semana empieza el lunes y pertenece al año de
 * su jueves): {clave: '2026-W42', lunes: '2026-10-12', rotulo: 'Sem. 12 oct'}, o null.
 */
function semanaIso(fechaIso) {
  var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fechaIso || '').trim());
  if (!partes) return null;
  var dia = 86400000;
  var fecha = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  var lunes = new Date(fecha - ((new Date(fecha).getUTCDay() + 6) % 7) * dia);
  var jueves = new Date(lunes.getTime() + 3 * dia);
  var anio = jueves.getUTCFullYear();
  var numero = Math.floor((jueves.getTime() - Date.UTC(anio, 0, 1)) / dia / 7) + 1;
  return {
    clave: anio + '-W' + (numero < 10 ? '0' : '') + numero,
    lunes: lunes.toISOString().slice(0, 10),
    rotulo: 'Sem. ' + lunes.getUTCDate() + ' ' + MESES_CORTOS[lunes.getUTCMonth()]
  };
}

/**
 * Todo lo que necesita el Panel, calculado en el momento desde las pestañas (no depende de
 * SemaforoDimensiones ni EstadoEquipos). Los filtros los aplica el navegador con resumirPanel.
 * Solo sale lo que se copia aquí campo por campo: ni `integrantes` de Equipos ni
 * `integrantes_presentes` de Tutorias salen del servidor.
 * datos: { equipos (como en leerEquipos), tutorias, respuestas, actas, compromisos, consultas
 *   (filas de la planilla) }. hoy: 'AAAA-MM-DD' en Chile.
 */
function armarPanel(datos, hoy) {
  datos = datos || {};
  var semaforo = filasSemaforoDimensiones(datos.tutorias, datos.respuestas, datos.actas);
  var estado = filasEstadoEquipos(datos.equipos, semaforo, hoy);

  // Un mismo nombre de dupla escrito con otras mayúsculas o tildes se muestra igual en todo el panel.
  var nombresDupla = {};
  var nombreDupla = function (texto) {
    var limpio = textoEnUnaLinea(texto);
    var clave = claveNombre(limpio);
    if (!clave) return '';
    return (nombresDupla[clave] = nombresDupla[clave] || limpio);
  };
  var colorODato = function (color) {
    return color === SIN_DATO_COLOR ? '' : color;
  };

  var equipos = estado.map(function (fila) {
    var colores = {};
    DIMENSIONES.forEach(function (d) {
      colores[d] = colorODato(fila['color_' + d.toLowerCase()]);
    });
    var dias = fila.dias_desde_ultima === '' ? null : fila.dias_desde_ultima;
    return {
      semestre: fila.semestre,
      numero: fila.equipo_numero,
      proyecto: fila.equipo_proyecto,
      curso: fila.curso,
      dupla: nombreDupla(fila.dupla),
      tutorias: fila.tutorias,
      ultimaFecha: fila.ultima_fecha,
      diasDesdeUltima: dias,
      colores: colores,
      peor: colorODato(fila.peor_color),
      sinTutoriaReciente: dias === null || dias >= DIAS_SIN_TUTORIA
    };
  });

  var actas = {};
  (datos.actas || []).forEach(function (a) {
    actas[a.tutoria_id] = a;
  });
  var tutorias = [];
  var porId = {};
  semaforo.forEach(function (fila) {
    var tutoria = porId[fila.tutoria_id];
    if (!tutoria) {
      var acta = actas[fila.tutoria_id];
      var estadoActa = !acta ? 'sin acta' : acta.estado === 'aprobada' ? 'aprobada' : 'borrador';
      var semana = semanaIso(fila.fecha);
      tutoria = porId[fila.tutoria_id] = {
        id: fila.tutoria_id,
        fecha: fila.fecha,
        semestre: fila.semestre,
        curso: fila.curso,
        dupla: nombreDupla(fila.dupla),
        equipoNumero: fila.equipo_numero,
        equipoProyecto: fila.equipo_proyecto,
        hitoNumero: fila.hito_numero,
        hitoNombre: fila.hito_nombre,
        conduce: fila.conduce,
        registra: fila.registra,
        colores: {},
        esUltima: fila.es_ultima_del_equipo,
        acta: estadoActa,
        actaUrl: estadoActa === 'aprobada' ? acta.documento_url || '' : '',
        semana: semana ? semana.clave : '',
        semanaRotulo: semana ? semana.rotulo : ''
      };
      tutorias.push(tutoria);
    }
    tutoria.colores[fila.dimension] = colorODato(fila.color);
  });
  // Más recientes primero.
  tutorias.reverse();

  var hijas = function (filas, copiar) {
    return (filas || []).filter(function (fila) {
      return porId[fila.tutoria_id];
    }).sort(function (a, b) {
      var ta = porId[a.tutoria_id];
      var tb = porId[b.tutoria_id];
      return tutorias.indexOf(ta) - tutorias.indexOf(tb) || Number(a.orden) - Number(b.orden);
    }).map(function (fila) {
      var t = porId[fila.tutoria_id];
      var objeto = {
        tutoriaId: t.id, fecha: t.fecha, semestre: t.semestre, curso: t.curso, dupla: t.dupla,
        equipoNumero: t.equipoNumero, equipoProyecto: t.equipoProyecto, hitoNumero: t.hitoNumero,
        hitoNombre: t.hitoNombre
      };
      copiar(objeto, fila);
      return objeto;
    });
  };

  var semestres = {};
  equipos.concat(tutorias).forEach(function (fila) {
    if (fila.semestre) semestres[fila.semestre] = true;
  });
  return {
    hoy: hoy,
    diasSinTutoria: DIAS_SIN_TUTORIA,
    dimensiones: DIMENSIONES.map(function (d) {
      return { codigo: d, nombre: NOMBRES_DIMENSION[d] };
    }),
    semestres: Object.keys(semestres).sort().reverse(),
    equipos: equipos,
    tutorias: tutorias,
    compromisos: hijas(datos.compromisos, function (objeto, fila) {
      objeto.descripcion = fila.descripcion;
      objeto.responsable = ETIQUETAS_RESPONSABLE[fila.responsable] || fila.responsable || '';
    }),
    consultas: hijas(datos.consultas, function (objeto, fila) {
      objeto.pregunta = fila.pregunta_equipo;
      objeto.respuesta = fila.respuesta_tutor || '';
    })
  };
}

/**
 * Tarjetas, tablas y gráficos del Panel para unos filtros {semestre, curso, dupla, hito}
 * (vacío = todos). El filtro de hito solo cambia la evolución y los compromisos y consultas:
 * el estado actual es siempre la última tutoría de cada equipo.
 *
 * El navegador recibe esta misma función (codigoCompartidoPanel), así que no puede usar nada
 * de fuera de su cuerpo.
 */
function resumirPanel(panel, filtros) {
  filtros = filtros || {};
  var dimensiones = panel.dimensiones.map(function (d) {
    return d.codigo;
  });
  var colores = ['verde', 'amarillo', 'rojo'];
  var coincide = function (fila, conHito) {
    return (!filtros.semestre || fila.semestre === filtros.semestre) &&
      (!filtros.curso || fila.curso === filtros.curso) &&
      (!filtros.dupla || fila.dupla === filtros.dupla) &&
      (!conHito || !filtros.hito || String(fila.hitoNumero) === String(filtros.hito));
  };
  var equipos = panel.equipos.filter(function (e) {
    return coincide(e, false);
  });
  var tutorias = panel.tutorias.filter(function (t) {
    return coincide(t, false);
  });
  var tutoriasDelHito = tutorias.filter(function (t) {
    return coincide(t, true);
  });
  var cuenta = function (lista, condicion) {
    return lista.filter(condicion).length;
  };

  // Rojos primero, después más días sin tutoría (sin ninguna cuenta como la más antigua).
  var dias = function (e) {
    return e.diasDesdeUltima === null ? Infinity : e.diasDesdeUltima;
  };
  equipos.sort(function (a, b) {
    return ((b.peor === 'rojo') - (a.peor === 'rojo')) || (dias(b) - dias(a) || 0) || a.numero - b.numero;
  });

  var problemas = dimensiones.map(function (d) {
    var fila = { codigo: d, verde: 0, amarillo: 0, rojo: 0, sinDato: 0 };
    equipos.forEach(function (e) {
      if (e.colores[d]) fila[e.colores[d]]++;
      else fila.sinDato++;
    });
    return fila;
  });

  var semanas = {};
  tutoriasDelHito.forEach(function (t) {
    if (!t.semana) return;
    var semana = semanas[t.semana] = semanas[t.semana] ||
      { clave: t.semana, rotulo: t.semanaRotulo, tutorias: 0, verde: 0, amarillo: 0, rojo: 0, total: 0 };
    semana.tutorias++;
    dimensiones.forEach(function (d) {
      if (colores.indexOf(t.colores[d]) === -1) return;
      semana[t.colores[d]]++;
      semana.total++;
    });
  });

  var duplas = {};
  var duplaDe = function (nombre) {
    return duplas[nombre] = duplas[nombre] || { dupla: nombre, equipos: 0, tutorias: 0, sinTutoriaReciente: 0,
      dimensionesEnRojo: 0, dimensionesConDato: 0, actasPendientes: 0 };
  };
  equipos.forEach(function (e) {
    var fila = duplaDe(e.dupla);
    fila.equipos++;
    if (e.sinTutoriaReciente) fila.sinTutoriaReciente++;
    dimensiones.forEach(function (d) {
      if (!e.colores[d]) return;
      fila.dimensionesConDato++;
      if (e.colores[d] === 'rojo') fila.dimensionesEnRojo++;
    });
  });
  tutorias.forEach(function (t) {
    var fila = duplaDe(t.dupla);
    fila.tutorias++;
    if (t.acta !== 'aprobada') fila.actasPendientes++;
  });

  var unicos = function (filas, campo) {
    var vistos = {};
    filas.forEach(function (f) {
      if (f[campo]) vistos[f[campo]] = true;
    });
    return Object.keys(vistos).sort(function (a, b) {
      return a.localeCompare(b, 'es');
    });
  };
  var delSemestre = function (fila) {
    return !filtros.semestre || fila.semestre === filtros.semestre;
  };
  var filasDelSemestre = panel.equipos.filter(delSemestre).concat(panel.tutorias.filter(delSemestre));
  var hitos = {};
  panel.tutorias.filter(delSemestre).forEach(function (t) {
    if (t.hitoNumero === '' || t.hitoNumero === null) return;
    var hito = hitos[t.hitoNumero] = hitos[t.hitoNumero] || { numero: t.hitoNumero, nombres: [] };
    if (t.hitoNombre && hito.nombres.indexOf(t.hitoNombre) === -1) hito.nombres.push(t.hitoNombre);
  });

  return {
    tarjetas: {
      tutorias: tutorias.length,
      equipos: equipos.length,
      equiposConRojo: cuenta(equipos, function (e) {
        return e.peor === 'rojo';
      }),
      sinTutoriaReciente: cuenta(equipos, function (e) {
        return e.sinTutoriaReciente;
      }),
      actasAprobadas: cuenta(tutorias, function (t) {
        return t.acta === 'aprobada';
      })
    },
    equipos: equipos,
    problemas: problemas,
    semanas: Object.keys(semanas).sort().map(function (clave) {
      return semanas[clave];
    }),
    duplas: Object.keys(duplas).sort(function (a, b) {
      // "Sin dupla" (nombre vacío) al final.
      return (a === '') - (b === '') || a.localeCompare(b, 'es');
    }).map(function (nombre) {
      var fila = duplas[nombre];
      fila.porcentajeRojo = fila.dimensionesConDato
        ? Math.round((100 * fila.dimensionesEnRojo) / fila.dimensionesConDato) : null;
      return fila;
    }),
    compromisos: panel.compromisos.filter(function (c) {
      return coincide(c, true);
    }),
    consultas: panel.consultas.filter(function (c) {
      return coincide(c, true);
    }),
    opciones: {
      cursos: unicos(filasDelSemestre, 'curso'),
      duplas: unicos(filasDelSemestre, 'dupla'),
      hitos: Object.keys(hitos).map(function (numero) {
        return { numero: hitos[numero].numero, nombre: hitos[numero].nombres.join(' / ') || 'Hito ' + numero };
      }).sort(function (a, b) {
        return a.numero - b.numero;
      })
    }
  };
}

/** El código de resumirPanel para el navegador (Index.html): el mismo que prueban las pruebas. */
function codigoCompartidoPanel() {
  return resumirPanel.toString();
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
  // Referencia: las edita coordinación a mano (o las importa desde CSV).
  Tutores: ['alias', 'nombre', 'apellido', 'correo', 'activo'],
  Duplas: ['semestre', 'dupla', 'tutor_1', 'tutor_2', 'activa'],
  Equipos: ['semestre', 'numero', 'nombre_proyecto', 'curso', 'dupla', 'integrantes', 'descripcion', 'activo'],
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
  // Las escribe la app.
  Tutorias: [
    'id', 'registrada_en', 'actualizada_en', 'fecha', 'semestre', 'equipo_numero', 'equipo_proyecto',
    'curso', 'dupla', 'hito_numero', 'hito_nombre', 'conduce_nombre', 'conduce_apellido', 'registra_nombre',
    'registra_apellido', 'integrantes_presentes'
  ],
  Respuestas: [
    'id', 'tutoria_id', 'orden', 'fecha', 'semestre', 'curso', 'equipo_numero', 'equipo_proyecto', 'dupla',
    'hito_numero', 'dimension', 'pregunta_clave', 'pregunta_texto', 'respuesta_texto', 'color', 'valor',
    'respuesta_propia', 'nota'
  ],
  PreguntasTutor: ['id', 'tutoria_id', 'orden', 'pregunta', 'respuesta'],
  ConsultasEquipo: ['id', 'tutoria_id', 'orden', 'pregunta_equipo', 'respuesta_tutor'],
  Compromisos: ['id', 'tutoria_id', 'orden', 'descripcion', 'responsable'],
  Actas: [
    'tutoria_id', 'estado', 'generado_con_ia', 'modelo_ia', 'contenido_generado', 'contenido_final',
    'documento_id', 'documento_url', 'nombre_archivo', 'generada_en', 'aprobada_en'
  ],
  // Tablas de análisis para Data Studio: el script las rehace completas en cada guardado.
  SemaforoDimensiones: [
    'tutoria_id', 'fecha', 'semestre', 'curso', 'equipo_numero', 'equipo_proyecto', 'dupla', 'hito_numero',
    'hito_nombre', 'conduce', 'registra', 'acta_estado', 'dimension', 'dimension_nombre', 'color', 'valor',
    'es_ultima_del_equipo'
  ],
  EstadoEquipos: [
    'semestre', 'equipo_numero', 'equipo_proyecto', 'curso', 'dupla', 'tutorias', 'ultima_fecha',
    'dias_desde_ultima'
  ].concat(DIMENSIONES.map(function (d) {
    return 'color_' + d.toLowerCase();
  })).concat(['peor_color', 'peor_valor', 'calculado_en'])
};

// Pestañas que escribe la app: quedan protegidas con advertencia (se pueden editar a mano,
// pero Sheets avisa antes).
var PESTANAS_DE_LA_APP = [
  'Tutorias', 'Respuestas', 'PreguntasTutor', 'ConsultasEquipo', 'Compromisos', 'Actas',
  'SemaforoDimensiones', 'EstadoEquipos'
];

// En las pestañas de referencia solo van como texto el semestre y la fecha, para que la
// planilla no los convierta en fechas propias ("2026-2" no es febrero de 2026).
var COLUMNAS_TEXTO_REFERENCIA = {
  Duplas: ['semestre'],
  Equipos: ['semestre'],
  Hitos: ['semestre', 'fecha'],
  Preguntas: ['vigencia']
};

// En las pestañas de la app todo va como texto (un "=" al inicio de una respuesta no es una
// fórmula), salvo estas columnas numéricas o booleanas y las fechas de Data Studio.
var COLUMNAS_NO_TEXTO = {
  Tutorias: ['equipo_numero', 'hito_numero'],
  Respuestas: ['orden', 'equipo_numero', 'hito_numero', 'valor'],
  PreguntasTutor: ['orden'],
  ConsultasEquipo: ['orden'],
  Compromisos: ['orden'],
  SemaforoDimensiones: ['equipo_numero', 'hito_numero', 'valor', 'es_ultima_del_equipo'],
  EstadoEquipos: ['equipo_numero', 'tutorias', 'dias_desde_ultima', 'peor_valor']
};
var COLUMNAS_FECHA = {
  SemaforoDimensiones: ['fecha'],
  EstadoEquipos: ['ultima_fecha']
};

/** '@' (texto), 'yyyy-mm-dd' (fecha) o null (formato automático) para una columna. */
function formatoDeColumna(nombre, columna) {
  if ((COLUMNAS_FECHA[nombre] || []).indexOf(columna) !== -1) return 'yyyy-mm-dd';
  if (PESTANAS_DE_LA_APP.indexOf(nombre) !== -1) {
    return (COLUMNAS_NO_TEXTO[nombre] || []).indexOf(columna) === -1 ? '@' : null;
  }
  return (COLUMNAS_TEXTO_REFERENCIA[nombre] || []).indexOf(columna) !== -1 ? '@' : null;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Copiloto')
    .addItem('Configurar planilla', 'configurarPlanilla')
    .addItem('Recalcular tablas de análisis', 'recalcularTablasAnalisis')
    .addToUi();
}

/**
 * Crea las pestañas y columnas que falten, siembra los hitos de ejemplo (solo si la pestaña
 * Hitos está vacía) y el banco de preguntas, protege con advertencia las pestañas de la app y
 * recalcula las tablas de análisis. Se puede correr de nuevo: no borra ni pisa nada.
 */
function configurarPlanilla() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  // La aplicación web la abre por id si no hay planilla activa.
  PropertiesService.getScriptProperties().setProperty('ID_PLANILLA', libro.getId());
  var bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);
  try {
    var creadas = [];
    Object.keys(COLUMNAS).forEach(function (nombre) {
      if (!libro.getSheetByName(nombre)) creadas.push(nombre);
      prepararHoja(libro, nombre);
    });
    var protegidas = PESTANAS_DE_LA_APP.filter(function (nombre) {
      return protegerConAdvertencia(libro.getSheetByName(nombre));
    });

    var hitos = 0;
    if (!leerHoja('Hitos').length) {
      hitos = sembrar('Hitos', HITOS_EJEMPLO.hitos.map(function (h) {
        return [HITOS_EJEMPLO.semestre, h.curso, h.numero, h.nombre, h.fecha];
      }), [0, 1, 2]);
    }
    var preguntas = sembrar('Preguntas', BANCO_PREGUNTAS.preguntas.map(function (p) {
      var fila = [p.clave, BANCO_PREGUNTAS.vigencia, p.curso, p.hito_numero === null ? '' : p.hito_numero,
        p.dimension, p.texto, p.fuente || '', 'SI'];
      for (var i = 0; i < NUMERO_ALTERNATIVAS; i++) {
        var alternativa = p.alternativas[i];
        fila.push(alternativa ? alternativa.texto : '', alternativa ? alternativa.color : '');
      }
      return fila;
    }), [0]);

    var hojaInicial = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
    if (hojaInicial && hojaInicial.getLastRow() === 0 && libro.getSheets().length > 1) {
      libro.deleteSheet(hojaInicial);
    }
    obtenerCarpetaActas();
    var analisis = recalcularSinBloqueo();

    var resumen = 'Planilla lista. Pestañas nuevas: ' + (creadas.length ? creadas.join(', ') : 'ninguna') +
      '. Protegidas con advertencia: ' + (protegidas.length ? protegidas.join(', ') : 'ninguna nueva') +
      '. Filas nuevas: ' + hitos + ' hitos de ejemplo, ' + preguntas + ' preguntas. ' + analisis;
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
    ? pestana.getRange(1, 1, 1, pestana.getLastColumn()).getDisplayValues()[0].map(function (columna) {
      return columna.trim();
    })
    : [];
  // Agrega solo los encabezados que falten, al final, sin mover columnas que ya existan.
  var nuevas = columnas.filter(function (columna) {
    return actuales.indexOf(columna) === -1;
  });
  if (nuevas.length) {
    pestana.getRange(1, actuales.length + 1, 1, nuevas.length).setValues([nuevas]);
    actuales = actuales.concat(nuevas);
  }
  pestana.getRange(1, 1, 1, actuales.length).setFontWeight('bold');
  pestana.setFrozenRows(1);
  aplicarFormatos(pestana, nombre, actuales, 2, pestana.getMaxRows() - 1);
  return pestana;
}

/** Protección de toda la pestaña, solo con advertencia. false si ya tenía una. */
function protegerConAdvertencia(pestana) {
  if (pestana.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return false;
  pestana.protect()
    .setDescription('La escribe el Copiloto de Tutorías. Edítala a mano solo si la app falla.')
    .setWarningOnly(true);
  return true;
}

/** Agrega las filas cuya clave (columnas `indicesClave`) no esté ya en la hoja. */
function sembrar(nombre, filas, indicesClave) {
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
    var objeto = {};
    columnas.forEach(function (columna, i) {
      objeto[columna] = fila[i];
    });
    return objeto;
  }));
  return nuevas.length;
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
  if (!h.getLastColumn()) return [];
  return h.getRange(1, 1, 1, h.getLastColumn()).getDisplayValues()[0].map(function (columna) {
    return columna.trim();
  });
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
  }).filter(function (objeto) {
    // Las filas que quedaron en blanco (por ejemplo, borradas a mano) no cuentan.
    return columnas.some(function (columna) {
      return objeto[columna] !== '';
    });
  });
}

function letraDeColumna(numero) {
  var letras = '';
  while (numero > 0) {
    var resto = (numero - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    numero = Math.floor((numero - 1) / 26);
  }
  return letras;
}

/** Formato de texto o de fecha en las columnas que lo llevan, en dos llamadas como máximo. */
function aplicarFormatos(pestana, nombre, columnas, desdeFila, cantidad) {
  if (cantidad < 1) return;
  var porFormato = {};
  columnas.forEach(function (columna, i) {
    var formato = formatoDeColumna(nombre, columna);
    if (!formato) return;
    var letra = letraDeColumna(i + 1);
    (porFormato[formato] = porFormato[formato] || []).push(letra + desdeFila + ':' + letra + (desdeFila + cantidad - 1));
  });
  Object.keys(porFormato).forEach(function (formato) {
    pestana.getRangeList(porFormato[formato]).setNumberFormat(formato);
  });
}

/**
 * Escribe objetos {columna: valor} desde `numeroFila`, en una sola llamada. Agrega filas a la
 * pestaña si hace falta y antes deja el formato de cada columna (texto o fecha).
 */
function escribirFilas(nombre, numeroFila, objetos) {
  if (!objetos.length) return;
  var pestana = hoja(nombre);
  var columnas = encabezados(nombre);
  var faltan = numeroFila + objetos.length - 1 - pestana.getMaxRows();
  if (faltan > 0) pestana.insertRowsAfter(pestana.getMaxRows(), faltan);
  aplicarFormatos(pestana, nombre, columnas, numeroFila, objetos.length);
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

/** Vacía la pestaña (menos los encabezados) y escribe las filas nuevas. */
function reemplazarFilas(nombre, objetos) {
  var pestana = hoja(nombre);
  var ultima = pestana.getLastRow();
  if (ultima > 1) pestana.getRange(2, 1, ultima - 1, Math.max(pestana.getLastColumn(), 1)).clearContent();
  escribirFilas(nombre, 2, objetos);
}

/** Borra las filas de la tutoría, en bloques de filas seguidas, de abajo hacia arriba. */
function borrarFilasDeTutoria(nombre, tutoriaId) {
  var pestana = hoja(nombre);
  var filas = leerHoja(nombre).filter(function (r) {
    return r.tutoria_id === tutoriaId;
  }).map(function (r) {
    return r._fila;
  }).sort(function (a, b) {
    return b - a;
  });
  var i = 0;
  while (i < filas.length) {
    var hasta = filas[i];
    var desde = hasta;
    while (i + 1 < filas.length && filas[i + 1] === desde - 1) {
      i++;
      desde = filas[i];
    }
    pestana.deleteRows(desde, hasta - desde + 1);
    i++;
  }
}

function ahoraEnChile(formato) {
  return Utilities.formatDate(new Date(), ZONA_HORARIA, formato || 'yyyy-MM-dd HH:mm:ss');
}

/** Equipos de la planilla (los que tienen número, proyecto y curso), por número. */
function leerEquipos() {
  return leerHoja('Equipos').filter(function (e) {
    return e.numero && e.nombre_proyecto && e.curso;
  }).map(function (e) {
    return { semestre: e.semestre, numero: Number(e.numero), nombre: e.nombre_proyecto, curso: e.curso,
      dupla: e.dupla || '', integrantes: separarIntegrantes(e.integrantes), descripcion: e.descripcion || '',
      activo: estaActivo(e.activo) };
  }).sort(function (a, b) {
    return a.numero - b.numero;
  });
}

/**
 * Tutores, duplas, equipos, hitos y preguntas leídos de la planilla, con los tipos que esperan
 * las funciones puras. Las columnas `activo` y `activa` quedan como booleanos.
 */
function leerReferencia() {
  var tutores = leerHoja('Tutores').filter(function (t) {
    return t.alias || t.nombre;
  }).map(function (t) {
    return { alias: t.alias || t.nombre, nombre: t.nombre, apellido: t.apellido, activo: estaActivo(t.activo) };
  });
  var duplas = leerHoja('Duplas').filter(function (d) {
    return d.tutor_1 && d.tutor_2;
  }).map(function (d) {
    return { semestre: d.semestre, dupla: d.dupla || d.tutor_1 + ' y ' + d.tutor_2, tutor_1: d.tutor_1,
      tutor_2: d.tutor_2, activa: estaActivo(d.activa) };
  });
  var equipos = leerEquipos();
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
  return { tutores: tutores, duplas: duplas, equipos: equipos, hitos: hitos, preguntas: preguntas };
}

/** Rehace SemaforoDimensiones y EstadoEquipos. Quien llama ya tiene el bloqueo. */
function recalcularSinBloqueo() {
  var semaforo = filasSemaforoDimensiones(leerHoja('Tutorias'), leerHoja('Respuestas'), leerHoja('Actas'));
  var calculadoEn = ahoraEnChile();
  var estado = filasEstadoEquipos(leerReferencia().equipos, semaforo, calculadoEn.slice(0, 10)).map(function (fila) {
    fila.calculado_en = calculadoEn;
    return fila;
  });
  reemplazarFilas('SemaforoDimensiones', semaforo);
  reemplazarFilas('EstadoEquipos', estado);
  return 'Tablas de análisis: ' + semaforo.length + ' filas en SemaforoDimensiones y ' + estado.length +
    ' en EstadoEquipos.';
}

/** Ítem de menú "Copiloto > Recalcular tablas de análisis". */
function recalcularTablasAnalisis() {
  var resumen = conBloqueo(recalcularSinBloqueo);
  Logger.log(resumen);
  return resumen;
}

/** Después de guardar: si el recálculo falla, la tutoría ya quedó guardada igual. */
function recalcularSinFallar() {
  try {
    recalcularSinBloqueo();
  } catch (error) {
    console.log('No se pudieron recalcular las tablas de análisis: ' + error);
  }
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

/**
 * Lo que necesita la página al abrir: tutores activos, equipos activos, la dupla y sus equipos
 * para cada par de tutores registrado, hitos por curso (con el sugerido) y guiones.
 */
function obtenerDatosIniciales() {
  var referencia = leerReferencia();
  var hoy = ahoraEnChile('yyyy-MM-dd');
  var activos = referencia.equipos.filter(function (e) {
    return e.activo;
  });

  var tutores = referencia.tutores.filter(function (t) {
    return t.activo;
  }).map(function (t) {
    return { alias: t.alias, clave: claveNombre(t.alias), nombre: nombreVisibleTutor(t) };
  }).sort(function (a, b) {
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  // Clave del par: las claves de los dos tutores, ordenadas y unidas por "|".
  var duplasPorPar = {};
  referencia.duplas.forEach(function (d) {
    var dupla = buscarDupla(referencia.duplas, d.tutor_1, d.tutor_2);
    if (!dupla) return;
    var par = [claveNombre(d.tutor_1), claveNombre(d.tutor_2)].sort().join('|');
    duplasPorPar[par] = {
      dupla: dupla.dupla,
      equipos: equiposDeLaDupla(activos, dupla).map(function (e) {
        return e.numero;
      })
    };
  });

  var hitosPorCurso = {};
  var guiones = {};
  activos.forEach(function (equipo) {
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
  var semestres = activos.map(function (e) {
    return e.semestre;
  }).sort();
  return {
    semestre: semestres.length ? semestres[semestres.length - 1] : '',
    hoy: hoy,
    tutores: tutores,
    duplasPorPar: duplasPorPar,
    equipos: activos.map(function (e) {
      return { numero: e.numero, nombre: e.nombre, curso: e.curso, dupla: e.dupla, integrantes: e.integrantes };
    }),
    hitosPorCurso: hitosPorCurso,
    guiones: guiones,
    dimensiones: DIMENSIONES.map(function (d) {
      return { codigo: d, nombre: NOMBRES_DIMENSION[d] };
    }),
    maximoCompromisos: MAXIMO_COMPROMISOS
  };
}

/**
 * El Panel de seguimiento, calculado en el momento con la fecha de hoy en Chile. Lo puede ver
 * cualquiera que abra la aplicación; armarPanel no deja salir datos de estudiantes.
 */
function obtenerPanel() {
  return armarPanel({
    equipos: leerEquipos(),
    tutorias: leerHoja('Tutorias'),
    respuestas: leerHoja('Respuestas'),
    actas: leerHoja('Actas'),
    compromisos: leerHoja('Compromisos'),
    consultas: leerHoja('ConsultasEquipo')
  }, ahoraEnChile('yyyy-MM-dd'));
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

var PESTANAS_DE_LA_TUTORIA = ['Respuestas', 'PreguntasTutor', 'ConsultasEquipo', 'Compromisos'];

/**
 * Guarda una tutoría: una fila en Tutorias y una por respuesta, pregunta del tutor, consulta y
 * compromiso en sus pestañas. Con `entrada.id` de una tutoría existente (sin acta aprobada) la
 * reemplaza. Después rehace las tablas de análisis. Devuelve el id y el semáforo.
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
      dupla: t.dupla,
      hito_numero: t.hitoNumero,
      hito_nombre: t.hitoNombre,
      conduce_nombre: t.conduceNombre,
      conduce_apellido: t.conduceApellido,
      registra_nombre: t.registraNombre,
      registra_apellido: t.registraApellido,
      integrantes_presentes: t.integrantesPresentes.join(', ')
    };
    if (existente) {
      escribirFila('Tutorias', existente._fila, fila);
      PESTANAS_DE_LA_TUTORIA.forEach(function (nombre) {
        borrarFilasDeTutoria(nombre, id);
      });
    } else {
      agregarFila('Tutorias', fila);
    }
    var hijo = function (i) {
      return { id: Utilities.getUuid(), tutoria_id: id, orden: i + 1 };
    };
    agregarFilas('Respuestas', preparada.respuestas.map(function (r, i) {
      var objeto = hijo(i);
      objeto.fecha = fila.fecha;
      objeto.semestre = fila.semestre;
      objeto.curso = fila.curso;
      objeto.equipo_numero = fila.equipo_numero;
      objeto.equipo_proyecto = fila.equipo_proyecto;
      objeto.dupla = fila.dupla;
      objeto.hito_numero = fila.hito_numero;
      objeto.dimension = r.dimension;
      objeto.pregunta_clave = r.preguntaClave;
      objeto.pregunta_texto = r.preguntaTexto;
      objeto.respuesta_texto = r.respuestaTexto;
      objeto.color = r.color;
      objeto.valor = valorColor(r.color);
      objeto.respuesta_propia = r.respuestaPropia ? 'SI' : 'NO';
      objeto.nota = r.nota;
      return objeto;
    }));
    agregarFilas('PreguntasTutor', preparada.preguntasTutor.map(function (p, i) {
      var objeto = hijo(i);
      objeto.pregunta = p.pregunta;
      objeto.respuesta = p.respuesta;
      return objeto;
    }));
    agregarFilas('ConsultasEquipo', preparada.consultas.map(function (c, i) {
      var objeto = hijo(i);
      objeto.pregunta_equipo = c.preguntaEquipo;
      objeto.respuesta_tutor = c.respuestaTutor;
      return objeto;
    }));
    agregarFilas('Compromisos', preparada.compromisos.map(function (c, i) {
      var objeto = hijo(i);
      objeto.descripcion = c.descripcion;
      objeto.responsable = c.responsable;
      return objeto;
    }));
    recalcularSinFallar();
    return { id: id, semaforo: calcularSemaforo(preparada.respuestas), respuestas: preparada.respuestas.length };
  });
}

function filasDeTutoria(nombre, tutoriaId) {
  return leerHoja(nombre).filter(function (r) {
    return r.tutoria_id === tutoriaId;
  }).sort(function (a, b) {
    return Number(a.orden) - Number(b.orden);
  });
}

/** Contexto del acta desde la copia guardada de la tutoría. */
function contextoDesdePlanilla(tutoriaId) {
  var tutoria = leerHoja('Tutorias').filter(function (t) {
    return t.id === tutoriaId;
  })[0];
  if (!tutoria) throw new Error('No se encontró la tutoría ' + tutoriaId + ' en la planilla.');
  var respuestas = filasDeTutoria('Respuestas', tutoriaId).sort(function (a, b) {
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
    tutorConduce: textoEnUnaLinea(tutoria.conduce_nombre + ' ' + tutoria.conduce_apellido),
    tutorRegistra: textoEnUnaLinea(tutoria.registra_nombre + ' ' + tutoria.registra_apellido),
    integrantesPresentes: separarIntegrantes(tutoria.integrantes_presentes),
    respuestasBanco: respuestas.filter(function (r) {
      return COLORES.indexOf(r.color) !== -1;
    }).map(function (r) {
      return {
        dimension: r.dimension, preguntaTexto: r.pregunta_texto, textoElegido: r.respuesta_texto,
        colorElegido: r.color, nota: r.nota || '', respuestaPropia: r.respuesta_propia === 'SI'
      };
    }),
    preguntasTutor: filasDeTutoria('PreguntasTutor', tutoriaId).map(function (p) {
      return { pregunta: p.pregunta, respuesta: p.respuesta };
    }),
    consultasEquipo: filasDeTutoria('ConsultasEquipo', tutoriaId).map(function (c) {
      return { preguntaEquipo: c.pregunta_equipo, respuestaTutor: c.respuesta_tutor };
    }),
    compromisos: filasDeTutoria('Compromisos', tutoriaId).filter(function (c) {
      return RESPONSABLES.indexOf(c.responsable) !== -1;
    }).map(function (c) {
      return { descripcion: c.descripcion, responsable: c.responsable };
    })
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
    recalcularSinFallar();
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
    estaActivo: estaActivo,
    nombreVisibleTutor: nombreVisibleTutor,
    separarIntegrantes: separarIntegrantes,
    buscarDupla: buscarDupla,
    equiposDeLaDupla: equiposDeLaDupla,
    calcularSemaforo: calcularSemaforo,
    valorColor: valorColor,
    peorColor: peorColor,
    hitosDelCurso: hitosDelCurso,
    hitoSugerido: hitoSugerido,
    preguntasDelGuion: preguntasDelGuion,
    prepararTutoria: prepararTutoria,
    armarPrompt: armarPrompt,
    armarObservacionesRespaldo: armarObservacionesRespaldo,
    clasificarErrorGemini: clasificarErrorGemini,
    textoDeRespuestaGemini: textoDeRespuestaGemini,
    generarConCascada: generarConCascada,
    diasEntre: diasEntre,
    filasSemaforoDimensiones: filasSemaforoDimensiones,
    filasEstadoEquipos: filasEstadoEquipos,
    semanaIso: semanaIso,
    armarPanel: armarPanel,
    resumirPanel: resumirPanel,
    codigoCompartidoPanel: codigoCompartidoPanel,
    lineasObservaciones: lineasObservaciones,
    armarMinuta: armarMinuta,
    nombreArchivoActa: nombreArchivoActa
  };
}
