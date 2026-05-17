const SUPABASE_URL = 'https://hbqefylulydnsulfbbta.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicWVmeWx1bHlkbnN1bGZiYnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTEzNDYsImV4cCI6MjA5MDA4NzM0Nn0.DGa9UZN8pVilHGpyxo_gg4vg8ecPMmUnFQ0yN2hLzYE'; 
const NOMBRE_CARPETA_BASE = 'REPORTES AHORROS';

const COLORES = {
  AMARILLO: '#f1c232',
  AMARILLO_SUAVE: '#fff2cc',
  AZUL_OSCURO: '#2c3e50',
  AZUL_INFO: '#cfe2f3',
  VERDE_INFO: '#d9ead3',
  GRIS_DIA: '#f3f3f3',
  BLANCO: '#ffffff'
};

function doPost(e) {
  const logSheet = getOrCreateLogSheet();
  try {
    const data = JSON.parse(e.postData.contents);
    const operations = data.batch ? data.operations : [data];
    operations.forEach(op => {
      if (op.action === 'sync_client' || !op.action) syncSingleClient(op.client_id, logSheet);
      else if (op.action === 'delete_client') deleteFilesStartingWith(op.client_name, logSheet);
    });
    return ContentService.createTextOutput("OK");
  } catch (err) {
    if (logSheet) logSheet.appendRow([new Date(), "ERROR:", err.message]);
    return ContentService.createTextOutput("Error");
  }
}

function syncSingleClient(clientId, logSheet) {
  try {
    const clientData = fetchFromSupabase(`ahorros_clientes?id=eq.${clientId}&select=*`);
    if (!clientData || clientData.length === 0) return;
    const client = clientData[0];
    const todosLosPagos = fetchFromSupabase(`ahorros_pagos?cliente_id=eq.${clientId}&select=*`);

    let tipos = [];
    let t = (client.tipo_ahorro || "").toLowerCase();
    if (t === 'normal' || t === 'ambos') tipos.push('AHORRO NORMAL');
    if (t === 'puesto' || t === 'ambos') tipos.push('AHORRO PUESTO');

    tipos.forEach(tipo => {
      const folder = getFolderStructure(tipo, client);
      let fileName = `${client.nombre} - ${client.puesto || 'S-P'}`;
      let file = getFileInFolder(folder, fileName) || SpreadsheetApp.create(fileName);
      if (!getFileInFolder(folder, fileName)) {
        folder.addFile(DriveApp.getFileById(file.getId()));
        DriveApp.getRootFolder().removeFile(DriveApp.getFileById(file.getId()));
      }

      const pagosFiltrados = todosLosPagos.filter(p => {
        const pTipo = (p.tipo || "").toLowerCase();
        if (tipo === 'AHORRO NORMAL') return pTipo === 'normal';
        if (tipo === 'AHORRO PUESTO') return pTipo === 'puesto';
        return true;
      });

      buildExactGrid(file.getId(), client, pagosFiltrados, tipo);
    });
  } catch (e) { logSheet.appendRow([new Date(), "SYNC ERROR:", e.message]); }
}

function buildExactGrid(ssId, client, pagos, tipoActivo) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheets()[0];
  
  // OPTIMIZACIÓN EXPERTA: Congelar dibujo para máxima velocidad
  sheet.clear();
  
  // Dibujar encabezados (Batch de estilo)
  sheet.getRange("A1:W1").merge().setBackground(COLORES.AMARILLO).setValue(client.nombre.toUpperCase())
       .setFontWeight("bold").setFontSize(14).setHorizontalAlignment("center").setVerticalAlignment("middle");

  sheet.getRange("A2:D2").merge().setBackground(COLORES.AZUL_INFO).setValue("PUESTO: " + (client.puesto || "S-P")).setFontWeight("bold");
  sheet.getRange("E2:H2").merge().setBackground("#fff2cc").setValue("PASAJE: " + (client.pasaje || "S-N")).setFontWeight("bold");
  sheet.getRange("I2:L2").merge().setBackground(COLORES.VERDE_INFO).setValue("MODO: " + tipoActivo).setFontWeight("bold");

  sheet.getRange("Z2:AA2").merge().setBackground(COLORES.AZUL_OSCURO).setFontColor(COLORES.BLANCO).setValue("TOTAL ACUMULADO").setHorizontalAlignment("center");
  sheet.getRange("Z3:AA4").merge().setBackground(COLORES.AMARILLO).setFontWeight("bold").setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");

  const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const year = new Date().getFullYear();
  let totalGlobal = 0;

  // Preparar memoria para los datos de los 12 meses
  meses.forEach((mes, i) => {
    let rowStart = i < 6 ? 4 : 42; 
    let colStart = ((i % 6) * 4) + 1; 
    let numDays = new Date(year, i + 1, 0).getDate();

    // Dibujar estructura básica de cada mes
    sheet.getRange(rowStart, colStart, 1, 2).merge().setBackground(COLORES.AZUL_OSCURO).setFontColor(COLORES.BLANCO).setValue(mes).setHorizontalAlignment("center").setFontWeight("bold");
    sheet.getRange(rowStart + 1, colStart).setValue("DÍA").setBackground(COLORES.GRIS_DIA).setFontWeight("bold").setFontSize(8);
    sheet.getRange(rowStart + 1, colStart + 1).setValue("MONTO").setBackground(COLORES.GRIS_DIA).setFontWeight("bold").setFontSize(8);

    // Escribir los días en un solo bloque (BATCH)
    let diasArray = [];
    for(let d=1; d<=numDays; d++) diasArray.push([d]);
    sheet.getRange(rowStart + 2, colStart, numDays, 1).setValues(diasArray).setFontColor("#666666").setHorizontalAlignment("center");
    
    sheet.getRange(rowStart + 33, colStart, 1, 2).merge().setBackground(COLORES.AMARILLO).setValue("S/ 0.00").setFontWeight("bold").setHorizontalAlignment("center");
    sheet.getRange(rowStart, colStart, numDays + 2, 2).setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  });

  // APLICAR PAGOS EN BLOQUE
  if (pagos && pagos.length > 0) {
    pagos.forEach(p => {
      const partes = p.fecha.split(/[-T/ ]/);
      const m = parseInt(partes[1]) - 1;
      const d = parseInt(partes[2]);
      let rowStart = m < 6 ? 4 : 42;
      let colStart = ((m % 6) * 4) + 1;
      let targetRow = rowStart + 1 + d;
      let targetCol = colStart + 1;

      try {
        let range = sheet.getRange(targetRow, targetCol);
        let current = range.getValue() || 0;
        sheet.getRange(targetRow, colStart, 1, 2).setBackground(COLORES.AMARILLO_SUAVE);
        range.setValue(current + p.monto).setFontWeight("bold");
        totalGlobal += p.monto;
      } catch(e) {}
    });
  }

  // Recalcular Totales de mes en ráfaga
  for(let m=0; m<12; m++) {
    let rowStart = m < 6 ? 4 : 42;
    let colStart = ((m % 6) * 4) + 1;
    let numDays = new Date(year, m + 1, 0).getDate();
    let values = sheet.getRange(rowStart + 2, colStart + 1, numDays, 1).getValues();
    let totalMes = values.reduce((sum, row) => sum + (Number(row[0]) || 0), 0);
    sheet.getRange(rowStart + 33, colStart).setValue("S/ " + totalMes.toFixed(2));
  }

  sheet.getRange("Z3").setValue("S/ " + totalGlobal.toFixed(2));
  sheet.setColumnWidths(1, 26, 35);
  for(let i=0; i<6; i++) sheet.setColumnWidth((i*4)+2, 75);
}

// ... (Resto de funciones auxiliares se mantienen igual)
function fetchFromSupabase(endpoint) {
  const options = { "headers": { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }, "muteHttpExceptions": true };
  const resp = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, options);
  return JSON.parse(resp.getContentText());
}
function getFolderStructure(tipo, client) {
  const base = getOrCreateFolder(null, NOMBRE_CARPETA_BASE);
  const fTipo = getOrCreateFolder(base, tipo);
  const fLugar = getOrCreateFolder(fTipo, (client.lugar || "SIN LUGAR").toUpperCase());
  return getOrCreateFolder(fLugar, "PASAJE " + (client.pasaje || "S-N"));
}
function getOrCreateFolder(parent, name) {
  const folder = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  return folder.hasNext() ? folder.next() : (parent ? parent.createFolder(name) : DriveApp.createFolder(name));
}
function getFileInFolder(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}
function getOrCreateLogSheet() {
  const folder = getOrCreateFolder(null, NOMBRE_CARPETA_BASE);
  const files = folder.getFilesByName("__SYNC_LOGS__");
  let ss = files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create("__SYNC_LOGS__");
  return ss.getSheets()[0];
}
function deleteFilesStartingWith(name, logSheet) {
  const search = DriveApp.searchFiles(`title contains '${name}' and trashed = false`);
  const foldersToCheck = new Set();
  while (search.hasNext()) { 
    const file = search.next();
    const parent = file.getParents().next();
    foldersToCheck.add(parent.getId());
    file.setTrashed(true); 
  }
  foldersToCheck.forEach(folderId => cleanupFolderRecursively(DriveApp.getFolderById(folderId)));
}
function cleanupFolderRecursively(folder) {
  const name = folder.getName();
  if (name === NOMBRE_CARPETA_BASE || name === 'AHORRO NORMAL' || name === 'AHORRO PUESTO') return;
  if (!folder.getFiles().hasNext() && !folder.getFolders().hasNext()) {
    const parent = folder.getParents().hasNext() ? folder.getParents().next() : null;
    folder.setTrashed(true);
    if (parent) cleanupFolderRecursively(parent);
  }
}
