/**
 * ServiLimpieza JLH — CMS backend (Google Apps Script + Google Sheets + Google Drive).
 *
 * Este script convierte una hoja de Google Sheets en la base de datos del sitio web:
 * imágenes/video/PDF (hoja "Media"), y el texto de Servicios, Precios, Ciudades,
 * Testimonios y Config. El sitio (content-loader.js) lee estos datos vía doGet().
 * El panel admin.html escribe/actualiza/elimina vía doPost().
 *
 * INSTALACIÓN — ver backend/README.md para el paso a paso completo.
 */

// Nombres de las hojas (tabs) dentro del spreadsheet. Centralizado aquí para que
// un cambio de nombre de hoja solo se edite en un lugar.
const SHEETS = {
  MEDIA: 'Media',
  SERVICIOS: 'Servicios',
  PRECIOS: 'Precios',
  CIUDADES: 'Ciudades',
  TESTIMONIOS: 'Testimonios',
  CONFIG: 'Config'
};

// Encabezados de columnas por hoja. El orden importa: define el orden de columnas
// que se crea en una hoja nueva y el orden en que se leen/escriben filas.
const HEADERS = {
  Media: ['id', 'seccion', 'tipo', 'nombre', 'url', 'alt_text', 'orden', 'activo', 'fecha_actualizacion'],
  Servicios: ['id', 'icon', 'title', 'desc', 'price', 'orden', 'activo'],
  Precios: ['id', 'icon', 'title', 'desc1', 'desc2', 'price', 'orden', 'activo'],
  Ciudades: ['id', 'nombre', 'orden', 'activo'],
  Testimonios: ['id', 'quote', 'author', 'orden', 'activo'],
  Config: ['key', 'value']
};

/**
 * onOpen — dibuja un menú propio "JLH Admin" en la barra de menús de la hoja
 * de cálculo, para que el mantenimiento diario se pueda hacer sin abrir el
 * editor de Apps Script. Se ejecuta automáticamente cada vez que se abre la hoja.
 * Recibe: el evento de apertura (no se usa). Retorna: nada.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧹 JLH Admin')
    .addItem('0. Configurar token admin y carpeta de Drive', 'configurarPropiedadesUI')
    .addItem('1. Crear hojas y encabezados', 'crearHojasYEncabezados')
    .addItem('2. Migrar contenido inicial (texto)', 'migrarContenidoTextual')
    .addItem('3. Sincronizar medios desde carpeta de Drive', 'sincronizarMediaDesdeDriveUI')
    .addItem('4. Reparar URLs de medios (arreglar imágenes rotas)', 'repararUrlsMediaUI')
    .addToUi();
}

/**
 * configurarPropiedadesUI — asistente de configuración inicial: pide (por
 * cuadros de diálogo) el token secreto del panel admin y el ID de la carpeta
 * raíz de Drive donde se guardarán los archivos subidos, y los guarda como
 * Script Properties (no quedan escritos en el código ni en la hoja).
 * Recibe: nada. Retorna: nada. Llamada por: el menú "JLH Admin".
 */
function configurarPropiedadesUI() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const tokenActual = props.getProperty('ADMIN_TOKEN');
  const tokenResp = ui.prompt(
    'Token del panel admin',
    (tokenActual ? 'Ya hay un token configurado. Déjalo en blanco para conservarlo, o escribe uno nuevo:' :
      'Crea una clave secreta (letras/números, sin espacios) que admin.html usará para autenticarse:'),
    ui.ButtonSet.OK_CANCEL
  );
  if (tokenResp.getSelectedButton() === ui.Button.OK) {
    const nuevo = tokenResp.getResponseText().trim();
    if (nuevo) props.setProperty('ADMIN_TOKEN', nuevo);
  }

  const folderResp = ui.prompt(
    'Carpeta raíz de Drive',
    'Pega el ID de la carpeta de Drive donde se guardarán las imágenes/videos/PDFs subidos desde el panel admin:',
    ui.ButtonSet.OK_CANCEL
  );
  if (folderResp.getSelectedButton() === ui.Button.OK) {
    const folderId = folderResp.getResponseText().trim();
    if (folderId) props.setProperty('DRIVE_ROOT_FOLDER_ID', folderId);
  }

  ui.alert('Configuración guardada.');
}

/**
 * crearHojasYEncabezados — crea cada hoja definida en SHEETS si todavía no
 * existe, y escribe la fila de encabezados si la hoja está vacía. Nunca borra
 * ni sobrescribe una hoja existente con datos (Regla de migración: solo agregar).
 * Recibe: nada. Retorna: nada. Llamada por: el menú "JLH Admin" o manualmente.
 */
function crearHojasYEncabezados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[name]);
      sheet.setFrozenRows(1);
    }
  });
  SpreadsheetApp.getUi().alert('Listo: hojas y encabezados verificados.');
}

/**
 * migrarContenidoTextual — inserta el contenido que hoy está escrito a mano
 * dentro del sitio (servicios, precios, ciudades, testimonios y el número de
 * WhatsApp) como filas iniciales de cada hoja, para que nada se pierda al
 * pasar a administrarlo desde Sheets. Es seguro ejecutarla varias veces: si
 * una hoja ya tiene filas de datos, no vuelve a insertar (no duplica, no borra).
 * Recibe: nada. Retorna: nada. Llamada por: el menú "JLH Admin" o manualmente.
 */
function migrarContenidoTextual() {
  crearHojasYEncabezados();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  insertarSiVacia_(ss.getSheetByName(SHEETS.SERVICIOS), [
    ['svc-1', '🛏️', 'Colchones', 'Doble, King o Queen. Full (2 caras) o 1 cara. Eliminamos ácaros, manchas y olores profundos.', '$120.000 – $170.000', 1, true],
    ['svc-2', '🛋️', 'Tapicería de Muebles', 'Sofás 2-3 puestos, salas en L, poltronas, cabeceros y tapetes. Lavado con vapor y extracción.', '$110.000 – $180.000', 2, true],
    ['svc-3', '🪑', 'Sillas y Complementos', 'Sillas de comedor, tapetes y alfombras. Recupera el color original y elimina suciedad acumulada.', '$70.000 – $250.000', 3, true],
    ['svc-4', '🚗', 'Tapicería de Autos', 'Asientos y tapizado interior. Limpieza profunda que devuelve el aspecto original a tu vehículo.', 'Consultar precio', 4, true],
    ['svc-5', '🐱', 'Camas para Mascotas', 'Camas y gimnasios para gatos. Protocolos especializados para eliminar olores de mascotas.', 'Consultar precio', 5, true],
    ['svc-6', '🧹', 'Alfombras y Tapetes', 'Desde alfombras pequeñas hasta tapetes grandes. Extracción profunda de polvo, bacterias y manchas.', 'Desde $70.000', 6, true]
  ]);

  insertarSiVacia_(ss.getSheetByName(SHEETS.PRECIOS), [
    ['pr-1', '🛏️', 'Colchones', 'Doble, King o Queen', 'Full (2 caras) o 1 cara', '$120.000 – $170.000', 1, true],
    ['pr-2', '🛋️', 'Muebles', 'Sofás 2-3 puestos', 'Salas en L, poltronas', '$110.000 – $180.000', 2, true],
    ['pr-3', '🪑', 'Complementos', 'Sillas de comedor', 'Tapetes y alfombras', '$70.000 – $250.000', 3, true]
  ]);

  insertarSiVacia_(ss.getSheetByName(SHEETS.CIUDADES), [
    ['city-1', 'Bogotá', 1, true],
    ['city-2', 'Chía', 2, true],
    ['city-3', 'Soacha', 3, true],
    ['city-4', 'Madrid', 4, true],
    ['city-5', 'Mosquera', 5, true],
    ['city-6', 'Funza', 6, true]
  ]);

  insertarSiVacia_(ss.getSheetByName(SHEETS.TESTIMONIOS), [
    ['test-1', 'El sofá quedó como nuevo. Tenía manchas de años que yo creía que nunca saldrían. ¡Excelente servicio y muy puntuales!', 'María C., Bogotá', 1, true],
    ['test-2', 'Lavaron el colchón de mis hijos y eliminaron completamente el olor a pipí de mascota. Los recomiendo 100%. Muy profesionales.', 'Carlos R., Soacha', 2, true],
    ['test-3', 'Las sillas del comedor quedaron impecables. Hice el agendamiento por WhatsApp y llegaron en el horario acordado. Volveré a contratar.', 'Sandra M., Chía', 3, true]
  ]);

  insertarSiVacia_(ss.getSheetByName(SHEETS.CONFIG), [
    ['whatsapp_numero', '573118298533'],
    ['whatsapp_numero_display', '311 829 8533'],
    ['whatsapp_texto_general', 'Hola, quiero información'],
    ['whatsapp_texto_cotizar', 'Hola, quiero cotizar'],
    ['marquee_texto', 'PROMO ESPECIAL: Lavado colchón 1.40 + ¡BASE CAMA GRATIS! — Escríbenos al 311 829 8533']
  ]);

  SpreadsheetApp.getUi().alert('Listo: contenido inicial migrado (solo en hojas vacías, nada se sobrescribió).');
}

/**
 * insertarSiVacia_ — agrega filas a una hoja SOLO si hoy no tiene datos más
 * allá del encabezado. Es la salvaguarda central de "nunca borrar, siempre
 * agregar": evita duplicar contenido si la migración se ejecuta más de una vez.
 * Recibe: sheet (hoja destino), rows (arreglo de arreglos con los valores).
 * Retorna: nada. Llamada por: migrarContenidoTextual().
 */
function insertarSiVacia_(sheet, rows) {
  if (sheet.getLastRow() > 1) return; // ya tiene datos reales, no tocar
  rows.forEach((r) => sheet.appendRow(r));
}

/**
 * sincronizarMediaDesdeDriveUI — versión de sincronizarMediaDesdeDrive_ pensada
 * para llamarse desde el menú de Sheets: pide el ID de la carpeta de Drive por
 * un cuadro de diálogo y muestra el resultado en una alerta.
 * Recibe: nada (pide el folderId interactivamente). Retorna: nada.
 * Llamada por: el menú "JLH Admin".
 */
function sincronizarMediaDesdeDriveUI() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    'Sincronizar medios desde Drive',
    'Pega el ID de la carpeta de Drive "JLH_CMS_Media" (estructura: subcarpetas = secciones, ej. hero, servicios, galeria):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const folderId = resp.getResponseText().trim();
  const agregados = sincronizarMediaDesdeDrive_(folderId);
  ui.alert(`Listo: ${agregados} archivo(s) nuevo(s) agregado(s) a la hoja Media.`);
}

/**
 * sincronizarMediaDesdeDrive_ — recorre las subcarpetas de una carpeta de
 * Drive (una subcarpeta por sección: hero, servicios, galeria, testimonios,
 * etc.) y por cada archivo que todavía no esté registrado en la hoja Media
 * (comparado por fileId guardado dentro de la URL), crea una fila nueva con
 * el tipo detectado por su mime type y una URL pública de solo-lectura.
 * Recibe: folderId (string, ID de la carpeta raíz en Drive).
 * Retorna: número de archivos nuevos agregados. Llamada por:
 * sincronizarMediaDesdeDriveUI() y opcionalmente doPost (acción "sync_media").
 */
function sincronizarMediaDesdeDrive_(folderId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MEDIA);
  const existentes = leerFilas_(sheet).map((r) => r.url);
  const root = DriveApp.getFolderById(folderId);
  const subfolders = root.getFolders();
  let agregados = 0;

  while (subfolders.hasNext()) {
    const folder = subfolders.next();
    const seccion = folder.getName();
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const tipo = tipoDesdeMime_(file.getMimeType());
      if (!tipo) continue; // ignora archivos que no son imagen/video/pdf
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = urlDirectaDrive_(file.getId(), tipo);
      if (existentes.indexOf(url) !== -1) continue; // ya estaba registrado
      sheet.appendRow([
        Utilities.getUuid(),
        seccion,
        tipo,
        file.getName(),
        url,
        file.getName(),
        sheet.getLastRow(), // orden: al final por defecto, se puede reordenar luego
        true,
        new Date().toISOString()
      ]);
      agregados++;
    }
  }
  return agregados;
}

/**
 * tipoDesdeMime_ — traduce un mime type de Drive al tipo simplificado que usa
 * la hoja Media ("imagen" | "video" | "pdf"). Recibe: mimeType (string).
 * Retorna: el tipo, o null si el archivo no es un tipo soportado por el sitio.
 * Llamada por: sincronizarMediaDesdeDrive_() y el endpoint de subida (doPost).
 */
function tipoDesdeMime_(mimeType) {
  if (mimeType.indexOf('image/') === 0) return 'imagen';
  if (mimeType.indexOf('video/') === 0) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return null;
}

/**
 * urlDirectaDrive_ — construye la URL pública que el sitio puede usar
 * directamente en un <img> o enlace, según el tipo de archivo. Se usa
 * "thumbnail" para imágenes porque es el único formato que Google garantiza
 * para incrustar imágenes de Drive en una página externa (el formato antiguo
 * "uc?export=view" no es confiable). El video y el PDF usan el visor
 * estándar de Drive ("/view") para abrirse en una pestaña nueva: Google
 * bloquea con su propia política de seguridad que el visor de video se
 * muestre incrustado (iframe) en un sitio externo, así que en vez de
 * reproducirlo incrustado, el sitio lo abre aparte. Recibe: fileId (string),
 * tipo ("imagen"|"video"|"pdf"). Retorna: URL (string). Llamada por:
 * sincronizarMediaDesdeDrive_(), subirArchivo_() y repararUrlsMedia_().
 */
function urlDirectaDrive_(fileId, tipo) {
  if (tipo === 'pdf' || tipo === 'video') return `https://drive.google.com/file/d/${fileId}/view`;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
}

/**
 * extraerFileIdDeUrl_ — recupera el ID de archivo de Drive a partir de una
 * URL ya guardada en la hoja Media, sin importar cuál de los formatos de
 * urlDirectaDrive_() se haya usado para generarla. Recibe: url (string).
 * Retorna: el ID (string) o null si no lo reconoce. Llamada por:
 * repararUrlsMedia_().
 */
function extraerFileIdDeUrl_(url) {
  const m = String(url).match(/[?&]id=([^&]+)/) || String(url).match(/\/d\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * repararUrlsMedia_ — recalcula la columna "url" de cada fila existente en
 * Media con el formato correcto de urlDirectaDrive_(), sin borrar ni crear
 * filas nuevas (solo corrige la URL de las que ya existen). Útil si se
 * actualiza la lógica de urlDirectaDrive_() después de haber sincronizado
 * archivos con una versión anterior. Recibe: nada. Retorna: número de filas
 * corregidas. Llamada por: el menú "JLH Admin".
 */
function repararUrlsMedia_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MEDIA);
  const headers = HEADERS.Media;
  const values = sheet.getDataRange().getValues();
  const urlCol = headers.indexOf('url');
  const tipoCol = headers.indexOf('tipo');
  let corregidas = 0;

  for (let i = 1; i < values.length; i++) {
    const fileId = extraerFileIdDeUrl_(values[i][urlCol]);
    if (!fileId) continue;
    const nuevaUrl = urlDirectaDrive_(fileId, values[i][tipoCol]);
    if (nuevaUrl !== values[i][urlCol]) {
      sheet.getRange(i + 1, urlCol + 1).setValue(nuevaUrl);
      corregidas++;
    }
  }
  return corregidas;
}

/**
 * repararUrlsMediaUI — versión de repararUrlsMedia_() para llamarse desde el
 * menú de Sheets, con confirmación visual. Recibe: nada. Retorna: nada.
 * Llamada por: el menú "JLH Admin".
 */
function repararUrlsMediaUI() {
  const n = repararUrlsMedia_();
  SpreadsheetApp.getUi().alert(`Listo: ${n} URL(s) corregida(s) en la hoja Media.`);
}

/**
 * leerFilas_ — lee todas las filas de datos de una hoja (sin el encabezado) y
 * las devuelve como arreglo de objetos { columna: valor }, usando la primera
 * fila de la hoja como nombres de columna. Recibe: sheet (hoja de Sheets).
 * Retorna: Array<Object>. Llamada por: doGet(), sincronizarMediaDesdeDrive_(),
 * y las operaciones de doPost (upsert/delete/reorder).
 */
function leerFilas_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * doGet — endpoint público (sin autenticación) que el sitio web consulta al
 * cargar la página. Devuelve solo las filas activas de cada hoja, ordenadas
 * por la columna "orden", más los pares clave/valor de Config.
 * Recibe: e (evento de solicitud HTTP GET de Apps Script, no se usa).
 * Retorna: ContentService con JSON. Llamada por: content-loader.js en el sitio.
 */
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const payload = {};

  ['Media', 'Servicios', 'Precios', 'Ciudades', 'Testimonios'].forEach((name) => {
    const rows = leerFilas_(ss.getSheetByName(name))
      .filter((r) => r.activo === true || r.activo === 'TRUE')
      .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    payload[name.toLowerCase()] = rows;
  });

  const configRows = leerFilas_(ss.getSheetByName(SHEETS.CONFIG));
  const config = {};
  configRows.forEach((r) => { config[r.key] = r.value; });
  payload.config = config;

  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * doPost — endpoint de administración (protegido con token) para el panel
 * admin.html: agregar/editar/eliminar/reordenar filas y subir archivos nuevos
 * a Drive. El cuerpo debe ser JSON con al menos { token, action }.
 * Recibe: e (evento de solicitud HTTP POST; e.postData.contents trae el JSON).
 * Retorna: ContentService con JSON { ok, data|error }. Llamada por: admin.html.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const tokenValido = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
    if (!tokenValido || body.token !== tokenValido) {
      return jsonError_('No autorizado.');
    }

    switch (body.action) {
      case 'list_all': return jsonOk_(listarTodo_());
      case 'upsert': return jsonOk_(upsertFila_(body.sheet, body.row));
      case 'delete': return jsonOk_(eliminarFila_(body.sheet, body.id));
      case 'reorder': return jsonOk_(reordenarFilas_(body.sheet, body.order));
      case 'upload_file': return jsonOk_(subirArchivo_(body));
      case 'sync_media': return jsonOk_({ agregados: sincronizarMediaDesdeDrive_(body.folderId) });
      default: return jsonError_('Acción desconocida: ' + body.action);
    }
  } catch (err) {
    return jsonError_(String(err));
  }
}

/**
 * listarTodo_ — igual que doGet() pero sin filtrar por "activo", para que el
 * panel admin.html pueda mostrar y editar también las filas desactivadas.
 * Recibe: nada. Retorna: objeto con todas las hojas como arreglos de filas.
 * Llamada por: doPost() con action "list_all".
 */
function listarTodo_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const payload = {};
  Object.keys(HEADERS).forEach((name) => {
    payload[name] = leerFilas_(ss.getSheetByName(name));
  });
  return payload;
}

/**
 * upsertFila_ — inserta una fila nueva (si row.id/row.key no existe todavía)
 * o actualiza la fila existente que tenga el mismo id/key. Nunca elimina otras
 * filas. Recibe: sheetName (string), row (objeto con las columnas a guardar).
 * Retorna: la fila guardada. Llamada por: doPost() con action "upsert".
 */
function upsertFila_(sheetName, row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  const idCol = sheetName === 'Config' ? 'key' : 'id';
  if (!row[idCol]) row[idCol] = Utilities.getUuid();
  if (sheetName === 'Media') row.fecha_actualizacion = new Date().toISOString();

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][headers.indexOf(idCol)]) === String(row[idCol])) {
      headers.forEach((h, col) => {
        if (row[h] !== undefined) sheet.getRange(i + 1, col + 1).setValue(row[h]);
      });
      return row;
    }
  }
  sheet.appendRow(headers.map((h) => (row[h] !== undefined ? row[h] : '')));
  return row;
}

/**
 * eliminarFila_ — borra la fila cuyo id/key coincide. Solo afecta esa fila;
 * el resto de la hoja queda intacto. Recibe: sheetName (string), id (string).
 * Retorna: { deleted: boolean }. Llamada por: doPost() con action "delete".
 */
function eliminarFila_(sheetName, id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  const idCol = sheetName === 'Config' ? 'key' : 'id';
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][headers.indexOf(idCol)]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

/**
 * reordenarFilas_ — actualiza la columna "orden" de una hoja según el arreglo
 * de ids recibido (la posición en el arreglo define el nuevo número de orden).
 * Recibe: sheetName (string), order (Array<string> de ids en el nuevo orden).
 * Retorna: { updated: number }. Llamada por: doPost() con action "reorder".
 */
function reordenarFilas_(sheetName, order) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  const idCol = headers.indexOf('id');
  const ordenCol = headers.indexOf('orden');
  const values = sheet.getDataRange().getValues();
  let updated = 0;
  order.forEach((id, idx) => {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        sheet.getRange(i + 1, ordenCol + 1).setValue(idx + 1);
        updated++;
        break;
      }
    }
  });
  return { updated };
}

/**
 * subirArchivo_ — recibe un archivo en base64 desde el panel admin.html, lo
 * guarda en la subcarpeta de Drive correspondiente a la sección (creándola si
 * no existe), lo comparte como "cualquiera con el enlace puede ver", y crea la
 * fila correspondiente en la hoja Media. Recibe: body con { fileData (base64),
 * fileName, mimeType, seccion, nombre, alt_text }. Retorna: la fila creada en
 * Media. Llamada por: doPost() con action "upload_file".
 */
function subirArchivo_(body) {
  const raizId = PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_FOLDER_ID');
  const raiz = DriveApp.getFolderById(raizId);
  const subfolders = raiz.getFoldersByName(body.seccion);
  const folder = subfolders.hasNext() ? subfolders.next() : raiz.createFolder(body.seccion);

  const bytes = Utilities.base64Decode(body.fileData);
  const blob = Utilities.newBlob(bytes, body.mimeType, body.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const tipo = tipoDesdeMime_(body.mimeType);
  const row = {
    id: Utilities.getUuid(),
    seccion: body.seccion,
    tipo: tipo,
    nombre: body.nombre || body.fileName,
    url: urlDirectaDrive_(file.getId(), tipo),
    alt_text: body.alt_text || body.nombre || body.fileName,
    orden: 999,
    activo: true,
    fecha_actualizacion: new Date().toISOString()
  };
  return upsertFila_('Media', row);
}

/**
 * jsonOk_ / jsonError_ — helpers para dar una forma de respuesta consistente
 * a doPost(). Reciben: data o mensaje de error. Retornan: ContentService JSON.
 * Llamadas por: doPost() y sus ramas de acción.
 */
function jsonOk_(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonError_(message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
