// El código nunca envía a la papelera, elimina ni quita permisos en el Drive (como R-14 del portal).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROHIBIDAS = [
  /\bsetTrashed\b/,
  /\bremoveFile\b/,
  /\bremoveFolder\b/,
  /\bremoveEditors?\b/,
  /\bremoveViewers?\b/,
  /\brevokePermissions\b/,
  /\bDrive\s*\.\s*(Files|Permissions)\s*\.\s*(remove|delete)\b/,
  /\bDrive\s*\.\s*(Files|Permissions)\s*\[\s*['"](remove|delete)['"]\s*\]/
];

/** Todos los archivos de una carpeta, a cualquier profundidad. */
function archivos(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivos(ruta) : [ruta];
  });
}

function llamadasProhibidas(texto) {
  return texto.split(/\r?\n/).flatMap((linea, i) =>
    PROHIBIDAS.filter((patron) => patron.test(linea)).map((patron) => 'línea ' + (i + 1) + ' (' + patron + '): ' + linea.trim())
  );
}

test('la revisión reconoce cada llamada prohibida', () => {
  [
    'archivo.setTrashed(true);', 'carpeta.removeFile(archivo);', 'DriveApp.removeFolder(c);',
    'Drive.Files.remove(id);', 'Drive.Files.delete(id);', 'Drive.Permissions.remove(id, p);',
    'Drive.Permissions.delete(id, p);', "Drive.Permissions['delete'](id, p);", 'archivo.removeEditor(correo);',
    'archivo.removeViewer(correo);', 'archivo.revokePermissions(correo);'
  ].forEach((codigo) => assert.equal(llamadasProhibidas(codigo).length, 1, codigo));
  // Borrar filas y pestañas de la planilla propia sí se permite.
  assert.deepEqual(llamadasProhibidas('hoja.deleteRows(2, 3); libro.deleteSheet(h); delete elegidas[id];'), []);
});

test('ningún archivo de src/ borra ni quita permisos en el Drive', () => {
  const src = path.join(__dirname, '..', 'src');
  const lista = archivos(src);
  assert.ok(lista.length > 0, 'src/ está vacía');
  lista.forEach((ruta) => {
    const halladas = llamadasProhibidas(fs.readFileSync(ruta, 'utf8'));
    assert.deepEqual(halladas, [], path.relative(src, ruta) + ' tiene llamadas prohibidas:\n' + halladas.join('\n'));
  });
});
