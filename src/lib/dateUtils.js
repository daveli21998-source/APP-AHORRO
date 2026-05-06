/**
 * Utilidades para manejo de fechas en el horario de Lima, Perú (UTC-5)
 */

/**
 * Retorna la fecha actual en formato YYYY-MM-DD respetando la zona horaria de Lima.
 * Evita el desfase de un día que ocurre con .toISOString() al final del día.
 */
export function getPeruDateString() {
  // 'en-CA' (Inglés canadiense) devuelve el formato YYYY-MM-DD nativamente
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/**
 * Retorna un objeto Date ajustado a la medianoche de Lima para cálculos de calendario.
 */
export function getPeruDateObject() {
  const dateStr = getPeruDateString();
  return new Date(dateStr + 'T12:00:00'); // T12:00 para evitar problemas de offset al manipular
}
