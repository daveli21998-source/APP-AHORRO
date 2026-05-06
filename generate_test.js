import ExcelJS from 'exceljs';
import fs from 'fs';

async function run() {
  const data = {
    tipo: 'normal',
    clientes: [
      {
        nombre: 'TEST CLIENTE',
        puesto: '1',
        pasaje: 'PASAJE 1',
        lugar: 'MERCADO TEST',
        pagos: [
          { fecha: '2024-01-05', monto: 10.5, tipo: 'normal' }
        ]
      }
    ]
  };

  const workbook = new ExcelJS.Workbook();
  const yellowColor = 'FFF1C40F';
  const softYellow = 'FFFEF9E7';
  const headerBlue = 'FF1B2631';
  const borderColor = 'FFD5D8DC';
  const monthsArr = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const year = new Date().getFullYear();

  const { clientes, tipo } = data;
  const sheetNames = new Set();

  clientes.forEach((cliente, index) => {
    const puestoStr = cliente.puesto ? `${cliente.puesto} ` : '';
    let safeName = (puestoStr + (cliente.nombre || `CLIENTE_${index + 1}`))
      .replace(/[:\\/?*[\]']/g, ' ')
      .trim();
    if (!safeName) safeName = `CLIENTE_${index + 1}`;
    safeName = safeName.substring(0, 27);

    let finalName = safeName;
    let counter = 1;
    while (sheetNames.has(finalName.toLowerCase())) {
      finalName = `${safeName} (${counter++})`;
    }
    sheetNames.add(finalName.toLowerCase());

    const sheet = workbook.addWorksheet(finalName);

    for (let m = 0; m < 6; m++) {
      const colBase = m * 3 + 1;
      sheet.getColumn(colBase).width = 4.5;
      sheet.getColumn(colBase + 1).width = 12.5;
      sheet.getColumn(colBase + 2).width = 2.5;
    }

    sheet.mergeCells('A1:R1');
    const headerRow = sheet.getCell('A1');
    headerRow.value = cliente.nombre.toUpperCase();
    headerRow.font = { size: 24, bold: true, name: 'Calibri' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yellowColor } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('A2:R2');
    const infoRow = sheet.getCell('A2');
    infoRow.value = `PUESTO: ${cliente.puesto || "-"}   |   PASAJE: ${cliente.pasaje || "-"}   |   LUGAR: ${cliente.lugar || "-"}`;
    infoRow.font = { bold: true, size: 10, name: 'Calibri' };
    infoRow.alignment = { horizontal: 'center' };

    const calendarBorder = {
      top: { style: 'thin', color: { argb: borderColor } },
      left: { style: 'thin', color: { argb: borderColor } },
      bottom: { style: 'thin', color: { argb: borderColor } },
      right: { style: 'thin', color: { argb: borderColor } }
    };

    let totalGlobal = 0;

    monthsArr.forEach((mes, m) => {
      const rowBase = Math.floor(m / 6) * 37 + 4;
      const colBase = (m % 6) * 3 + 1;
      const daysInMonth = new Date(year, m + 1, 0).getDate();

      sheet.mergeCells(rowBase, colBase, rowBase, colBase + 1);
      const mCell = sheet.getCell(rowBase, colBase);
      mCell.value = mes;
      mCell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
      mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
      mCell.alignment = { horizontal: 'center' };

      const dSub = sheet.getCell(rowBase + 1, colBase);
      dSub.value = "DÍA";
      dSub.font = { size: 8, bold: true };
      dSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
      dSub.alignment = { horizontal: 'center' };
      dSub.border = calendarBorder;

      const mSub = sheet.getCell(rowBase + 1, colBase + 1);
      mSub.value = "MONTO";
      mSub.font = { size: 8, bold: true };
      mSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5D8DC' } };
      mSub.alignment = { horizontal: 'center' };
      mSub.border = calendarBorder;

      let subtotalMes = 0;
      for (let d = 1; d <= 31; d++) {
        const tr = rowBase + 1 + d;
        const dayCell = sheet.getCell(tr, colBase);
        dayCell.value = d > daysInMonth ? "" : d;
        dayCell.alignment = { horizontal: 'center' };
        dayCell.border = calendarBorder;
        dayCell.font = { size: 9 };

        const amtCell = sheet.getCell(tr, colBase + 1);
        amtCell.border = calendarBorder;

        if (d <= daysInMonth) {
          const dateS = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const p = (cliente.pagos || []).find(pay => pay.fecha === dateS && (!pay.tipo || pay.tipo === tipo));

          if (p) {
            const montoFijo = Number(p.monto) || 0;
            amtCell.value = montoFijo;
            amtCell.numFmt = '[$S/] #,##0.00';
            amtCell.font = { bold: true, size: 10 };
            amtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: softYellow } };
            amtCell.alignment = { horizontal: 'right' };
            subtotalMes += montoFijo;
          }
        } else {
          dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F3F4' } };
          amtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F3F4' } };
        }
      }

      const tLabel = sheet.getCell(rowBase + 33, colBase);
      tLabel.value = "TOTAL";
      tLabel.font = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
      tLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
      tLabel.alignment = { horizontal: 'center' };
      tLabel.border = calendarBorder;

      const tVal = sheet.getCell(rowBase + 33, colBase + 1);
      tVal.value = subtotalMes || 0;
      tVal.numFmt = '[$S/] #,##0.00';
      tVal.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
      tVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBlue } };
      tVal.alignment = { horizontal: 'right' };
      tVal.border = calendarBorder;
      totalGlobal += subtotalMes;
    });

    sheet.mergeCells('S5:U5');
    const labelTotal = sheet.getCell('S5');
    labelTotal.value = "TOTAL ACUMULADO";
    labelTotal.font = { bold: true, size: 12 };
    labelTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yellowColor } };
    labelTotal.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('S6:U7');
    const finalVal = sheet.getCell('S6');
    finalVal.value = totalGlobal || 0;
    finalVal.numFmt = '[$S/] #,##0.00';
    finalVal.font = { size: 26, bold: true };
    finalVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yellowColor } };
    finalVal.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const b = await workbook.xlsx.writeBuffer();
  fs.writeFileSync('./test_out.xlsx', Buffer.from(b));
  console.log('Saved ./test_out.xlsx');

  // Now try to read it back and find errors using another workbook!
  try {
    const readWorkbook = new ExcelJS.Workbook();
    await readWorkbook.xlsx.readFile('./test_out.xlsx');
    console.log('Successfully re-read XLSX - no pure JS parse errors.');
  } catch (err) {
    console.error('Error re-reading file:', err);
  }
}

run();
