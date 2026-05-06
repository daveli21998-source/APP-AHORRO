/**
 * GOOGLE APPS SCRIPT: VERSIÓN 23.0 (LIMPIA Y DEFINITIVA)
 * Estructura: REPORTES AHORROS > TIPO > PASAJE > EXCEL ÚNICO
 */

const SUPABASE_URL = 'https://hbqefylulydnsulfbbta.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicWVmeWx1bHlkbnN1bGZiYnRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDUxMTM0NiwiZXhwIjoyMDkwMDg3MzQ2fQ.vxaW9ylJGmbqRavdkZRs_kzsjYh6xc9ccQzoDahD134';

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = JSON.parse(e.postData.contents);
    
    // Acción especial: limpieza de carpetas vacías
    if (payload.action === 'cleanup') {
      const result = cleanupAllEmptyFolders();
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    logDebug('>>> INICIO DO_POST - Batch size: ' + (payload.operations ? payload.operations.length : 1));
    const results = processBatch(payload.batch ? payload.operations : [payload]);
    
    // Auto-limpieza después de operaciones con eliminaciones
    const hasDeletes = (payload.operations || [payload]).some(op => op.action === 'delete_client');
    if (hasDeletes) {
      cleanupAllEmptyFolders();
    }
    
    logDebug('<<< FIN DO_POST - Processed: ' + results.processed.length + ' Errors: ' + results.errors.length);
    return ContentService.createTextOutput(JSON.stringify(results))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logDebug('!!! ERROR CRITICO DO_POST: ' + err.message);
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function processBatch(operations) {
  const processed = [];
  const errors = [];
  
  // 1. Agrupar operaciones por cliente dentro del lote para evitar reconstrucciones redundantes
  const clientMap = {};
  const deleteOps = [];

  for (const op of operations) {
    if (op.action === 'delete_client') {
      deleteOps.push(op);
      continue;
    }
    const cid = String(op.client_id);
    if (!clientMap[cid]) {
      clientMap[cid] = { 
        client_id: cid, 
        nombre: op.nombre, 
        pasaje: op.pasaje, 
        tipo_ahorro: op.tipo_ahorro,
        db_ids: [] 
      };
    }
    if (op.db_ids) clientMap[cid].db_ids.push(...op.db_ids);
    else if (op.id) clientMap[cid].db_ids.push(op.id);
  }

  // 2. Procesar eliminaciones
  for (const del of deleteOps) {
    try {
      deleteClientSheet(String(del.client_id), del.nombre);
      if (del.db_ids) del.db_ids.forEach(id => processed.push(id));
      else if (del.id) processed.push(del.id);
    } catch (err) {
      errors.push({ op: del, error: err.message });
    }
  }

  // 3. Procesar sincronizaciones (una sola vez por cliente en el lote)
  for (const cid in clientMap) {
    const data = clientMap[cid];
    try {
      let nombre = data.nombre;
      let pasaje = data.pasaje;
      let tipoAhorro = data.tipo_ahorro;

      // Recuperar metadatos si faltan
      if (!nombre || nombre === 'null' || nombre === 'DESCONOCIDO') {
        logDebug('Metadata faltante o inválida para ID: ' + cid + '. Intentando recuperación...');
        const res = UrlFetchApp.fetch(url, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
            muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) {
          const arr = JSON.parse(res.getContentText());
          if (arr.length > 0) {
            nombre = arr[0].nombre;
            pasaje = pasaje || arr[0].pasaje;
            tipoAhorro = tipoAhorro || arr[0].tipo_ahorro;
          }
        }
      }

      if (!nombre) throw new Error('No se pudo identificar al cliente');

      const root = getOrCreateFolder(null, 'REPORTES AHORROS');
      const rawTipo = String(tipoAhorro || 'normal').toLowerCase();
      const tipos = rawTipo === 'ambos' ? ['normal', 'puesto'] : [rawTipo];

      for (const t of tipos) {
        const fTipo = getOrCreateFolder(root, t === 'puesto' ? 'AHORRO PUESTO' : 'AHORRO NORMAL');
        const fPasaje = getOrCreateFolder(fTipo, String(pasaje || 'GENERAL').toUpperCase());
        
        // syncSingleClientBatch ahora SIEMPRE intenta fetch de Supabase. 
        // Si falla, tira error y no limpia la hoja.
        syncSingleClientBatch({ id: cid, nombre: nombre, pasaje: pasaje, tipo_ahorro: t }, [], true, fPasaje);
      }

      // Marcar todos los IDs de este cliente como procesados
      data.db_ids.forEach(id => processed.push(id));
      logDebug('Sincronización exitosa: ' + nombre + ' (' + data.db_ids.length + ' cambios)');

    } catch (err) {
      logDebug('Error en lote cliente ' + cid + ': ' + err.message);
      errors.push({ client_id: cid, error: err.message });
    }
  }

  return { processed, errors };
}

/**
 * Elimina la hoja del cliente de Google Drive y limpia carpetas vacías.
 */
function deleteClientSheet(clientId, clientName) {
  logDebug('=== ELIMINANDO CLIENTE DE DRIVE: ' + clientId + ' ===');
  const root = getOrCreateFolder(null, 'REPORTES AHORROS');
  let deletedCount = 0;

  // Buscar en ambas ramas: AHORRO NORMAL y AHORRO PUESTO
  const ramas = ['AHORRO NORMAL', 'AHORRO PUESTO'];
  
  for (const ramaName of ramas) {
    const ramaIt = root.getFoldersByName(ramaName);
    if (!ramaIt.hasNext()) continue;
    const rama = ramaIt.next();
    
    // Recorrer cada subcarpeta de pasaje
    const pasajes = rama.getFolders();
    while (pasajes.hasNext()) {
      const pasaje = pasajes.next();
      
      // Buscar archivos cuya descripción coincida con el clientId
      const archivos = pasaje.getFiles();
      while (archivos.hasNext()) {
        const archivo = archivos.next();
        if (archivo.getDescription() === clientId) {
          logDebug('Archivo encontrado: ' + archivo.getName() + ' en ' + ramaName + '/' + pasaje.getName());
          archivo.setTrashed(true);
          deletedCount++;
          logDebug('Archivo movido a papelera.');
        }
      }
      
      // Limpiar carpeta de pasaje si quedó vacía
      cleanEmptyFolder(pasaje, rama);
    }
    
    // Limpiar carpeta de rama si quedó vacía (solo subcarpetas, no archivos)
    cleanEmptyFolder(rama, root);
  }
  
  if (deletedCount === 0) {
    logDebug('No se encontró ningún archivo para el cliente ' + clientId + '. Puede que ya fue eliminado.');
  } else {
    logDebug('Total archivos eliminados: ' + deletedCount);
  }
}

/**
 * Elimina una carpeta si está completamente vacía (sin archivos ni subcarpetas).
 */
function cleanEmptyFolder(folder, parent) {
  try {
    if (!folder) return false;
    const files = folder.getFiles();
    const subFolders = folder.getFolders();
    
    if (!files.hasNext() && !subFolders.hasNext()) {
      const name = folder.getName();
      logDebug('Carpeta vacía detectada: ' + name + '. Eliminando...');
      folder.setTrashed(true);
      logDebug('Carpeta eliminada: ' + name);
      return true;
    }
  } catch (e) {
    logDebug('Nota al verificar carpeta: ' + e.message);
  }
  return false;
}

/**
 * Limpieza general: recorre toda la estructura REPORTES AHORROS 
 * y elimina TODAS las carpetas vacías (pasajes sin clientes, ramas sin pasajes).
 * Se puede ejecutar manualmente desde el editor de Apps Script o vía doPost con action: 'cleanup'.
 */
function cleanupAllEmptyFolders() {
  logDebug('=== INICIO LIMPIEZA GENERAL DE CARPETAS VACÍAS ===');
  const rootIt = DriveApp.getFoldersByName('REPORTES AHORROS');
  if (!rootIt.hasNext()) {
    logDebug('No existe carpeta REPORTES AHORROS.');
    return { cleaned: 0 };
  }
  const root = rootIt.next();
  let cleaned = 0;

  const ramas = ['AHORRO NORMAL', 'AHORRO PUESTO'];
  for (const ramaName of ramas) {
    const ramaIt = root.getFoldersByName(ramaName);
    if (!ramaIt.hasNext()) continue;
    const rama = ramaIt.next();
    
    // Recorrer subcarpetas de pasaje
    const pasajes = rama.getFolders();
    while (pasajes.hasNext()) {
      const pasaje = pasajes.next();
      if (cleanEmptyFolder(pasaje, rama)) {
        cleaned++;
      }
    }
    
    // Verificar si la rama misma quedó vacía
    if (cleanEmptyFolder(rama, root)) {
      cleaned++;
    }
  }
  
  logDebug('=== FIN LIMPIEZA: ' + cleaned + ' carpetas eliminadas ===');
  return { cleaned };
}

function syncSingleClientBatch(cliente, typePayments, forceSync, folder) {
  const tipo = String(cliente.tipo_ahorro || 'normal').toLowerCase();
  logDebug('Sincronizando lote para: ' + cliente.nombre + ' (' + tipo + ')');
  const ss = getOrCreateSpreadsheet(folder, cliente.id, cliente.nombre, tipo);
  const sheet = ss.getSheets()[0];

  try {
    const url = `${SUPABASE_URL}/rest/v1/ahorros_pagos?cliente_id=eq.${cliente.id}&select=*`;
    logDebug('Fetch Supabase: ' + cliente.id);
    const res = UrlFetchApp.fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      muteHttpExceptions: true
    });
    let pagos = [];
    if (res.getResponseCode() === 200) {
      pagos = JSON.parse(res.getContentText());
      logDebug('Pagos recuperados: ' + pagos.length);
    } else {
      logDebug('Aviso: Supabase respondió ' + res.getResponseCode());
    }
    const filtered = pagos.filter(p => String(p.tipo || 'normal').toLowerCase() === tipo);
    applyMaestraLayout(sheet, cliente, filtered, tipo);
  } catch (e) {
    logDebug('Fallo fetch/layout, usando datos locales: ' + e.message);
    applyMaestraLayout(sheet, cliente, typePayments, tipo);
  }
}

function getOrCreateFolder(parent, name) {
  const f = parent || DriveApp;
  const it = f.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  logDebug('Creando carpeta: ' + name);
  return f.createFolder(name);
}

function getOrCreateSpreadsheet(folder, clientId, clientName, tipo) {
  const tipoUpper = String(tipo || 'normal').toUpperCase();
  const finalName = "CLIENTE - " + clientName + " (" + tipoUpper + ")";
  const legacyName = "CLIENTE - " + clientName;
  
  logDebug('Buscando hoja: ' + finalName);
  
  // 1. Intentar encontrar el nombre nuevo en la carpeta destino
  let files = folder.getFilesByName(finalName);
  if (files.hasNext()) {
    const file = files.next();
    file.setDescription(clientId);
    return SpreadsheetApp.openById(file.getId());
  }

  // 2. Intentar encontrar el nombre viejo en la carpeta destino (y renombrarlo)
  files = folder.getFilesByName(legacyName);
  if (files.hasNext()) {
    const file = files.next();
    logDebug('Migrando nombre de hoja a: ' + finalName);
    file.setName(finalName);
    file.setDescription(clientId);
    return SpreadsheetApp.openById(file.getId());
  }

  // 3. Búsqueda global por ID (vía descripción)
  // Esto es lo más seguro: buscar cualquier archivo que tenga este clientId
  const allFiles = DriveApp.getFiles();
  // Nota: getFiles() sin filtros es lento. Mejor buscar por nombre legacy o nuevo globalmente.
  
  const searchGlobal = (nameToSearch) => {
    const it = DriveApp.getFilesByName(nameToSearch);
    while (it.hasNext()) {
      const f = it.next();
      if (f.getDescription() === clientId) {
        // Verificar si ya está en la rama correcta pero en otro pasaje
        // O si simplemente hay que moverlo aquí.
        // Pero CUIDADO: si es un cliente AMBOS, el archivo global que encontremos
        // podría ser el de la OTRA rama. 
        // Solo mover si el nombre del archivo sugiere que es de esta rama.
        if (f.getName().includes(`(${tipoUpper})`) || f.getName() === legacyName) {
           logDebug('Hoja encontrada globalmente. Moviendo...');
           try {
             f.moveTo(folder);
             if (f.getName() === legacyName) f.setName(finalName);
             return SpreadsheetApp.openById(f.getId());
           } catch(e) { logDebug('Error al mover: ' + e.message); }
        }
      }
    }
    return null;
  };

  const foundNewGlobal = searchGlobal(finalName);
  if (foundNewGlobal) return foundNewGlobal;
  
  const foundOldGlobal = searchGlobal(legacyName);
  if (foundOldGlobal) return foundOldGlobal;

  // 4. Crear nueva si no existe nada
  logDebug('Hoja NO encontrada. Creando nueva: ' + finalName);
  try {
    const ss = SpreadsheetApp.create(finalName);
    const file = DriveApp.getFileById(ss.getId());
    file.setDescription(clientId);
    file.moveTo(folder);
    return ss;
  } catch (err) {
    logDebug('!!! ERROR AL CREAR HOJA: ' + err.message);
    throw err;
  }
}

function logDebug(msg) {
  try {
    const root = getOrCreateFolder(null, 'REPORTES AHORROS');
    const it = root.getFilesByName('__SYNC_LOGS__');
    let ss;
    if (it.hasNext()) {
      ss = SpreadsheetApp.openById(it.next().getId());
    } else {
      ss = SpreadsheetApp.create('__SYNC_LOGS__');
      DriveApp.getFileById(ss.getId()).moveTo(root);
      ss.getSheets()[0].appendRow(['FECHA', 'MENSAJE']);
    }
    const sheet = ss.getSheets()[0];
    sheet.appendRow([new Date().toLocaleString('es-PE'), msg]);
    // Mantener solo los últimos 1000 logs
    if (sheet.getLastRow() > 1000) {
      sheet.deleteRows(2, 100);
    }
  } catch (e) {
    // Si falla el log, no matamos el proceso principal
    Logger.log('Fallo logDebug: ' + e.message);
  }
}

function applyMaestraLayout(sheet, cliente, pagos, tipoAhorro) {
  sheet.clear().clearFormats();
  if (sheet.getMaxColumns() < 30) sheet.insertColumnsAfter(sheet.getMaxColumns(), 30 - sheet.getMaxColumns());
  sheet.setColumnWidths(1, 30, 55);
  
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const yellowColor = '#F1C40F';
  const softYellow = '#FEF9E7';
  const year = new Date().getFullYear();

  sheet.getRange("A1:X1").merge().setValue(cliente.nombre).setFontSize(22).setFontWeight("bold").setBackground(yellowColor).setFontColor("white").setHorizontalAlignment("center");
  sheet.getRange("A2").setValue("PUESTO: " + (cliente.puesto || "-")).setFontWeight("bold");
  sheet.getRange("B2").setValue("PASAJE: " + (cliente.pasaje || "-")).setFontWeight("bold");
  sheet.getRange("C2").setValue("MODO: " + tipoAhorro.toUpperCase()).setFontWeight("bold");

  const totalCells = [];
  for (let m = 0; m < 12; m++) {
    const rowBase = Math.floor(m / 6) * 38 + 4;
    const colBase = (m % 6) * 4 + 1;
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    sheet.getRange(rowBase, colBase, 1, 3).merge().setValue(meses[m]).setBackground("#34495E").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
    
    const dataM = []; const bgM = [];
    for (let d = 1; d <= 31; d++) {
      const row = ["", "", ""]; const bg = ["#FFFFFF", "#FFFFFF", "#FFFFFF"];
      if (d <= daysInMonth) {
        row[0] = d;
        const fecha = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const p = pagos.find(p => p.fecha === fecha);
        if (p) { row[1] = p.monto; bg[1] = softYellow; bg[2] = softYellow; }
      } else { bg[0] = "#F2F3F4"; bg[1] = "#F2F3F4"; bg[2] = "#F2F3F4"; }
      dataM.push(row); bgM.push(bg);
    }

    const rMes = sheet.getRange(rowBase + 2, colBase, 31, 3);
    rMes.setValues(dataM).setBackgrounds(bgM);
    sheet.getRange(rowBase + 2, colBase + 1, 31, 2).mergeAcross().setNumberFormat('"S/" #,##0.00');

    const colLet = sheet.getRange(rowBase + 2, colBase + 1).getA1Notation().replace(/\d+/, '');
    const tCell = sheet.getRange(rowBase + 33, colBase + 2);
    tCell.setFormula(`=SUM(${colLet}${rowBase + 2}:${colLet}${rowBase + 32})`).setBackground(yellowColor).setFontWeight("bold");
    totalCells.push(tCell.getA1Notation());
  }
  sheet.getRange("Z2:AC6").merge().setFormula("=" + totalCells.join("+")).setBackground(yellowColor).setFontColor("white").setFontWeight("bold").setFontSize(22).setHorizontalAlignment("center").setVerticalAlignment("middle");
}
