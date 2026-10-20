// Carga los .gs de src/ como módulos de Node. En Apps Script no existe `module` y el
// module.exports del final de cada archivo no hace nada.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function cargarGs(nombre) {
  const ruta = path.join(__dirname, '..', 'src', nombre);
  const modulo = new Module(ruta, module);
  modulo.filename = ruta;
  modulo.paths = Module._nodeModulePaths(path.dirname(ruta));
  modulo._compile(fs.readFileSync(ruta, 'utf8'), ruta);
  return modulo.exports;
}

module.exports = {
  codigo: cargarGs('Codigo.gs'),
  datos: cargarGs('Datos.gs')
};
