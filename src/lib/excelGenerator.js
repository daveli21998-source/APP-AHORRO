import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * Genera un archivo Excel con el diseño de calendario profesional
 * @param {string} title - Nombre del archivo (ej: PSJ1)
 * @param {Array} clientes - Lista de clientes con sus pagos
 */
export async function generateExcelPasaje(title, clientes) {
    const workbook = new ExcelJS.Workbook();
    
    if (clientes.length === 0) {
        workbook.addWorksheet('Sin Datos');
    }

    const seenNames = new Set();

    for (const cliente of clientes) {
        // Limpiar nombre para que sea un nombre de pestaña válido en Excel
        let cleanName = cliente.nombre.replace(/[\[\]\*\?\:\\\/]/g, '').substring(0, 31).trim() || 'Cliente';
        
        // Manejar duplicados
        let finalName = cleanName;
        let counter = 1;
        while (seenNames.has(finalName.toLowerCase())) {
            const suffix = ` (${counter})`;
            finalName = cleanName.substring(0, 31 - suffix.length) + suffix;
            counter++;
        }
        seenNames.add(finalName.toLowerCase());

        const sheet = workbook.addWorksheet(finalName);
        
        // Configuración de columnas (Ancho)
        // Cada mes usa 3 columnas. 3 meses por fila = 9 columnas principales + espacios
        sheet.columns = [
            { width: 4 }, { width: 4 }, { width: 12 }, // Mes 1
            { width: 2 }, // Espacio
            { width: 4 }, { width: 4 }, { width: 12 }, // Mes 2
            { width: 2 }, // Espacio
            { width: 4 }, { width: 4 }, { width: 12 }, // Mes 3
            { width: 2 }, // Espacio
            { width: 4 }, { width: 4 }, { width: 12 }, // Mes 4
        ];

        // Estilos Comunes
        const borderThin = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        const headerFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' } // Amarillo
        };

        const totalFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD9EAD3' } // Verde claro o Gris azulado
        };
        
        // Dibujar 12 meses en una cuadrícula de 3 columnas x 4 filas
        const meses = [
            'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
            'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
        ];

        let totalGeneral = 0;

        for (let m = 0; m < 12; m++) {
            const rowIndex = Math.floor(m / 3) * 40 + 4; // Espaciado vertical
            const colStart = (m % 3) * 4 + 1;
            
            const monthName = meses[m];
            
            // Header del Mes
            const monthHeaderCell = sheet.getRow(rowIndex).getCell(colStart);
            sheet.mergeCells(rowIndex, colStart, rowIndex, colStart + 2);
            monthHeaderCell.value = monthName;
            monthHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
            monthHeaderCell.font = { bold: true };
            monthHeaderCell.border = borderThin;
            monthHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };

            // Subheaders: N° | | MONTO
            const subHeaderRow = sheet.getRow(rowIndex + 1);
            subHeaderRow.getCell(colStart).value = 'N°';
            subHeaderRow.getCell(colStart + 2).value = 'MONTO';
            
            [0, 1, 2].forEach(i => {
                const cell = subHeaderRow.getCell(colStart + i);
                cell.border = borderThin;
                cell.alignment = { horizontal: 'center' };
                cell.font = { size: 9, bold: true };
            });

            // Días 1-31
            let totalMes = 0;
            for (let d = 1; d <= 31; d++) {
                const dayRow = sheet.getRow(rowIndex + 1 + d);
                dayRow.getCell(colStart).value = d;
                dayRow.getCell(colStart).border = borderThin;
                dayRow.getCell(colStart).alignment = { horizontal: 'center' };
                
                dayRow.getCell(colStart + 1).border = borderThin;
                
                const montoCell = dayRow.getCell(colStart + 2);
                montoCell.border = borderThin;
                
                // Buscar pago para este día/mes
                const year = new Date().getFullYear();
                const fechaStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const pago = cliente.pagos?.find(p => p.fecha === fechaStr);
                if (pago) {
                    montoCell.value = `S/ ${pago.monto.toFixed(2)}`;
                    totalMes += Number(pago.monto);
                }
            }

            // Total del Mes
            const totalRowIndex = rowIndex + 33;
            const totalHeaderCell = sheet.getRow(totalRowIndex).getCell(colStart + 1);
            const totalValueCell = sheet.getRow(totalRowIndex).getCell(colStart + 2);
            
            totalHeaderCell.value = 'TOTAL';
            totalHeaderCell.border = borderThin;
            totalHeaderCell.font = { bold: true, size: 9 };
            
            totalValueCell.value = `S/ ${totalMes.toFixed(2)}`;
            totalValueCell.border = borderThin;
            totalValueCell.font = { bold: true };
            totalValueCell.fill = totalFill;
            
            totalGeneral += totalMes;
        }

        // Gran Total al Final
        const grandTotalRow = sheet.getRow(165); // Posición arbitraria al final
        sheet.mergeCells(165, 1, 170, 12);
        const grandTotalCell = grandTotalRow.getCell(1);
        grandTotalCell.value = `S/ ${totalGeneral.toFixed(2)}`;
        grandTotalCell.font = { size: 48, bold: true };
        grandTotalCell.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${title}.xlsx`);
}
