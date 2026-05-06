import ExcelJS from 'exceljs';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Función para preparar el buffer del Excel (Trabajo pesado en segundo plano)
export async function prepareExcelBuffer(title, clientes) {
    const workbook = new ExcelJS.Workbook();
    
    if (clientes.length === 0) {
        workbook.addWorksheet('Sin Datos');
    }

    const seenNames = new Set();
    const year = new Date().getFullYear();

    for (const cliente of clientes) {
        let cleanName = cliente.nombre.replace(/[\[\]\*\?\:\\\/]/g, '').substring(0, 31).trim() || 'Cliente';
        let finalName = cleanName;
        let counter = 1;
        while (seenNames.has(finalName.toLowerCase())) {
            const suffix = ` (${counter})`;
            finalName = cleanName.substring(0, 31 - suffix.length) + suffix;
            counter++;
        }
        seenNames.add(finalName.toLowerCase());

        const sheet = workbook.addWorksheet(finalName);
        
        // Ajuste de columnas para que se vea igual a la foto
        for (let i = 1; i <= 24; i++) {
            sheet.getColumn(i).width = 9; 
        }
        sheet.getColumn(25).width = 2; // Espacio
        sheet.getColumn(26).width = 18; // Total Box
        sheet.getColumn(27).width = 18;

        const colAmarillo = 'FFf1c232'; // Amarillo exacto de la App
        const colAzulOscuro = 'FF2c3e50'; // Azul exacto
        const colAmarilloSuave = 'FFfff2cc'; // Para pagos
        
        const solidFill = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } });
        const borderThin = {
            top: { style: 'thin', color: { argb: 'FFD5D8DC' } },
            left: { style: 'thin', color: { argb: 'FFD5D8DC' } },
            bottom: { style: 'thin', color: { argb: 'FFD5D8DC' } },
            right: { style: 'thin', color: { argb: 'FFD5D8DC' } }
        };

        // 1. Encabezado Principal (Nombre)
        sheet.mergeCells('A1:X1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = cliente.nombre.toUpperCase();
        titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = solidFill(colAmarillo);
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // 2. Info Puesto / Pasaje / Modo
        sheet.mergeCells('A2:D2');
        const pCell = sheet.getCell('A2');
        pCell.value = "PUESTO: " + (cliente.puesto || "-");
        pCell.font = { bold: true, color: { argb: 'FF2c3e50' } };
        pCell.fill = solidFill('FFcfe2f3');
        pCell.alignment = { horizontal: 'center' };

        sheet.mergeCells('E2:H2');
        const pasCell = sheet.getCell('E2');
        pasCell.value = "PASAJE: " + (cliente.pasaje || "-");
        pasCell.font = { bold: true };
        pasCell.fill = solidFill(colAmarilloSuave);
        pasCell.alignment = { horizontal: 'center' };

        // 3. Meses (6x2)
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        let subtotalRefs = [];
        
        for (let m = 0; m < 12; m++) {
            const rowBase = Math.floor(m / 6) * 38 + 4; 
            const colBase = (m % 6) * 4 + 1;
            const daysInMonth = new Date(year, m + 1, 0).getDate();

            // Cabecera Mes
            sheet.mergeCells(rowBase, colBase, rowBase, colBase + 1);
            const mHeader = sheet.getCell(rowBase, colBase);
            mHeader.value = meses[m];
            mHeader.fill = solidFill(colAzulOscuro);
            mHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            mHeader.alignment = { horizontal: 'center' };

            // Sub-cabeceras Día/Monto
            const diaH = sheet.getCell(rowBase + 1, colBase);
            diaH.value = "DÍA";
            diaH.fill = solidFill('FFf3f3f3');
            diaH.font = { size: 8, bold: true };
            diaH.alignment = { horizontal: 'center' };

            const monH = sheet.getCell(rowBase + 1, colBase + 1);
            monH.value = "MONTO";
            monH.fill = solidFill('FFf3f3f3');
            monH.font = { size: 8, bold: true };
            monH.alignment = { horizontal: 'center' };

            // Días del mes
            for (let d = 1; d <= 31; d++) {
                const r = rowBase + 1 + d;
                const cD = sheet.getCell(r, colBase);
                const cM = sheet.getCell(r, colBase + 1);
                cD.border = borderThin;
                cM.border = borderThin;

                if (d <= daysInMonth) {
                    cD.value = d;
                    cD.alignment = { horizontal: 'center' };
                    const fechaStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const p = (cliente.pagos || []).find(pay => pay.fecha === fechaStr);
                    if (p) {
                        cM.value = Number(p.monto);
                        cM.font = { bold: true };
                        cD.fill = solidFill(colAmarilloSuave);
                        cM.fill = solidFill(colAmarilloSuave);
                    }
                } else {
                    cD.fill = solidFill('FFF9F9F9');
                    cM.fill = solidFill('FFF9F9F9');
                }
            }

            // Total Mes
            sheet.mergeCells(rowBase + 33, colBase, rowBase + 33, colBase + 1);
            const sumCell = sheet.getCell(rowBase + 33, colBase);
            const colLet = sheet.getColumn(colBase + 1).letter;
            sumCell.value = { formula: `SUM(${colLet}${rowBase + 2}:${colLet}${rowBase + 32})` };
            sumCell.fill = solidFill(colAmarillo);
            sumCell.font = { bold: true };
            sumCell.alignment = { horizontal: 'center' };
            const subtotalColLet = sheet.getColumn(colBase).letter;
            subtotalRefs.push(`${subtotalColLet}${rowBase + 33}`);
        }

        // 4. Caja de Total Acumulado (La de la derecha)
        sheet.mergeCells('Z2:AA2');
        const tTitle = sheet.getCell('Z2');
        tTitle.value = "TOTAL ACUMULADO";
        tTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        tTitle.fill = solidFill(colAzulOscuro);
        tTitle.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.mergeCells('Z3:AA5');
        const tVal = sheet.getCell('Z3');
        tVal.value = { formula: subtotalRefs.join('+') };
        tVal.numFmt = '"S/" #,##0.00';
        tVal.font = { size: 24, bold: true };
        tVal.fill = solidFill(colAmarillo);
        tVal.alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Bordes gruesos para el total (Caja de la derecha)
        const totalCells = ['Z2', 'AA2', 'Z3', 'AA3', 'Z4', 'AA4', 'Z5', 'AA5'];
        totalCells.forEach(ref => {
            sheet.getCell(ref).border = {
                top: {style:'medium'}, left: {style:'medium'}, bottom: {style:'medium'}, right: {style:'medium'}
            };
        });
    }

    return await workbook.xlsx.writeBuffer();
}

// Función principal para compartir (WhatsApp/Telegram)
export async function generateExcelPasaje(title, clientes, preGeneratedBuffer = null) {
    const fileName = `${title}.xlsx`;
    let buffer = preGeneratedBuffer || await prepareExcelBuffer(title, clientes);

    try {
        const uint8 = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        const base64 = btoa(binary);
        
        // GUARD DE SEGURIDAD: Si estamos en PC, descargar directamente. Si es móvil, compartir.
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobile) {
            // Guardar archivo temporal
            const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: base64,
                directory: Directory.Cache
            });

            // COMPARTIR NATIVO (WhatsApp / Telegram)
            await Share.share({
                title: 'Reporte de Ahorros',
                files: [savedFile.uri],
                dialogTitle: 'Enviar por...'
            });
        } else {
            // DESCARGA DIRECTA (PC / Laptop)
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch (err) {
        console.error('Error al generar/compartir Excel:', err);
    }
}
