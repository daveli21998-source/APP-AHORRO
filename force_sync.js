const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwtyHuDgE_j3RHuyCB111Oyqba-B6fh4BtQQkOd7MZfmHhGfV1ZzQ3pZFyNb96E-EGvMQ/exec';

async function forceSyncAll() {
  console.log('🚀 Iniciando Sincronización Forzada de todos los clientes...');
  console.log('URL:', GOOGLE_SCRIPT_URL);
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'sync_all', trigger: 'manual_repair', timestamp: new Date().toISOString() })
    });
    const text = await res.text();
    console.log('✅ Respuesta recibida:', text);
  } catch (err) {
    console.error('❌ Error al enviar señal:', err.message);
  }
}

forceSyncAll();
