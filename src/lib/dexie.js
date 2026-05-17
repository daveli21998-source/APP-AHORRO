/**
 * ═══════════════════════════════════════════════════════════════
 *  APP AHORROS — Base de Datos Local con Dexie.js (IndexedDB)
 *  Almacenamiento offline robusto con transacciones ACID
 * ═══════════════════════════════════════════════════════════════
 */
import Dexie from 'dexie';

const db = new Dexie('AppAhorrosDB');

// ─── ESQUEMA v1 ──────────────────────────────────────────────
db.version(1).stores({
  // Cola de sincronización: operaciones pendientes hacia Supabase
  // Procesadas en orden estricto (FIFO) por autoincrement id
  sync_queue: '++id, type, status, created_at, client_ref',

  // Cola de sincronización hacia Google Drive
  drive_queue: '++id, action, client_id, status, created_at',

  // Logs de auditoría: historial completo de qué se sincronizó
  sync_logs: '++id, op_type, status, timestamp, client_ref, error',

  // Caché local de clientes (espejo de Supabase para modo offline)
  clients_cache: 'id, nombre, pasaje, lugar, tipo_ahorro',

  // Caché local de pagos (espejo de Supabase para modo offline)
  payments_cache: 'id, cliente_id, fecha, tipo',

  // Caché de pagos de hoy (para estado de colores)
  payments_today_cache: 'id, cliente_id, fecha, tipo',

  // Caché de lugares (para modo offline)
  lugares_cache: 'nombre',
});

export default db;

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES DE ESTADO
// ═══════════════════════════════════════════════════════════════
export const SYNC_STATUS = {
  PENDING:  'pending',
  SYNCING:  'syncing',
  SUCCESS:  'success',
  ERROR:    'error',
};

// ═══════════════════════════════════════════════════════════════
//  OPERACIONES DE LA COLA DE SUPABASE
// ═══════════════════════════════════════════════════════════════

/** Añade una operación a la cola de sincronización */
export async function enqueue(operation) {
  const entry = {
    ...operation,
    status: SYNC_STATUS.PENDING,
    created_at: new Date().toISOString(),
    retry_count: 0,
    last_error: null,
  };
  const id = await db.sync_queue.add(entry);

  // Notificar a la UI
  const count = await db.sync_queue.where('status').equals(SYNC_STATUS.PENDING).count();
  window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count } }));

  return id;
}

/** Obtiene la siguiente operación pendiente (FIFO estricto) */
export async function dequeueNext() {
  return db.sync_queue
    .where('status')
    .equals(SYNC_STATUS.PENDING)
    .first();
}

/** Marca una operación como en progreso */
export async function markSyncing(id) {
  await db.sync_queue.update(id, { status: SYNC_STATUS.SYNCING });
}

/** Marca una operación como exitosa y la mueve a logs */
export async function markSuccess(id) {
  const op = await db.sync_queue.get(id);
  if (!op) return;

  await db.transaction('rw', db.sync_queue, db.sync_logs, async () => {
    // Registrar en el log
    await db.sync_logs.add({
      op_type: op.type,
      op_data: JSON.stringify(op.data || {}),
      status: SYNC_STATUS.SUCCESS,
      timestamp: new Date().toISOString(),
      client_ref: op.client_ref || op.data?.cliente_id || null,
      error: null,
    });
    // Eliminar de la cola
    await db.sync_queue.delete(id);
  });

  // Notificar a la UI
  const count = await db.sync_queue.where('status').equals(SYNC_STATUS.PENDING).count();
  window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count } }));
}

/** Marca una operación como fallida */
export async function markError(id, errorMessage) {
  const op = await db.sync_queue.get(id);
  if (!op) return;

  await db.transaction('rw', db.sync_queue, db.sync_logs, async () => {
    await db.sync_queue.update(id, {
      status: SYNC_STATUS.ERROR,
      retry_count: (op.retry_count || 0) + 1,
      last_error: errorMessage,
    });

    await db.sync_logs.add({
      op_type: op.type,
      op_data: JSON.stringify(op.data || {}),
      status: SYNC_STATUS.ERROR,
      timestamp: new Date().toISOString(),
      client_ref: op.client_ref || op.data?.cliente_id || null,
      error: errorMessage,
    });
  });
}

/** Re-encola operaciones con error para reintento */
export async function requeueErrors(maxRetries = 5) {
  const errored = await db.sync_queue
    .where('status')
    .equals(SYNC_STATUS.ERROR)
    .toArray();

  let count = 0;
  for (const op of errored) {
    if ((op.retry_count || 0) < maxRetries) {
      await db.sync_queue.update(op.id, { status: SYNC_STATUS.PENDING });
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[SyncQueue] Re-encoladas ${count} operaciones para reintento.`);
    const total = await getPendingCount();
    window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: total } }));
  }
}

/** Recupera operaciones zombies atascadas en estado 'syncing' por más de maxAgeMs */
export async function requeueStale(maxAgeMs = 60000) {
  const stale = await db.sync_queue
    .where('status')
    .equals(SYNC_STATUS.SYNCING)
    .toArray();

  const now = Date.now();
  let recovered = 0;
  for (const op of stale) {
    const age = now - new Date(op.created_at).getTime();
    if (age > maxAgeMs) {
      console.warn(`[SyncQueue] Recuperando op zombie ${op.id} (tipo: ${op.type}, edad: ${Math.round(age/1000)}s)`);
      await db.sync_queue.update(op.id, { status: SYNC_STATUS.PENDING });
      recovered++;
    }
  }
  if (recovered > 0) {
    console.log(`[SyncQueue] ${recovered} operaciones zombie recuperadas.`);
  }
}

/** Cuenta de operaciones pendientes o con error */
export async function getPendingCount() {
  try {
    return await db.sync_queue
      .where('status')
      .anyOf([SYNC_STATUS.PENDING, SYNC_STATUS.ERROR, SYNC_STATUS.SYNCING])
      .count();
  } catch (e) {
    return 0;
  }
}

/** Obtiene todas las operaciones de la cola (para mezcla con datos online) */
export async function getAllQueueOps() {
  return db.sync_queue.toArray();
}

/** Actualiza el campo client_ref en operaciones que referencian un ID local */
export async function remapClientIds(localId, realId) {
  const ops = await db.sync_queue.toArray();
  for (const op of ops) {
    let changed = false;
    if (op.client_ref === localId) {
      op.client_ref = realId;
      changed = true;
    }
    if (op.data && op.data.cliente_id === localId) {
      op.data.cliente_id = realId;
      changed = true;
    }
    if (changed) {
      await db.sync_queue.update(op.id, { client_ref: op.client_ref, data: op.data });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  OPERACIONES DE LA COLA DE GOOGLE DRIVE
// ═══════════════════════════════════════════════════════════════

/** Añade una operación a la cola de Drive */
export async function enqueueDrive(operation) {
  return db.drive_queue.add({
    ...operation,
    status: SYNC_STATUS.PENDING,
    created_at: new Date().toISOString(),
  });
}

/** Obtiene y vacía las operaciones pendientes de Drive (para batch) */
export async function drainDriveQueue() {
  const ops = await db.drive_queue
    .where('status')
    .equals(SYNC_STATUS.PENDING)
    .toArray();
  return ops;
}

/** Elimina operaciones de Drive procesadas por sus IDs */
export async function removeDriveOps(ids) {
  await db.drive_queue.bulkDelete(ids);
}

/** Cuenta pendientes de Drive */
export async function getDrivePendingCount() {
  return db.drive_queue.where('status').equals(SYNC_STATUS.PENDING).count();
}

// ═══════════════════════════════════════════════════════════════
//  CACHÉ LOCAL (Espejo de Supabase)
// ═══════════════════════════════════════════════════════════════

/** Guarda la lista completa de clientes en caché, PRESERVANDO datos locales pendientes */
export async function cacheClients(clients) {
  // FASE 2: Merge inteligente en lugar de clear() + bulkPut()
  await db.transaction('rw', db.clients_cache, async () => {
    // FASE 4: Merge Idempotente (Append-Only)
    // Ya no borramos los registros locales si no vienen en la respuesta de Supabase
    // porque Supabase tiene límite de paginación de 1000 registros y borraba historial.
    if (clients && clients.length > 0) {
      const pending = await db.clients_cache.filter(c => c.status === 'pending').toArray();
      const pendingIds = new Set(pending.map(c => c.id));
      
      const remotos = clients.filter(c => !pendingIds.has(c.id));
      await db.clients_cache.bulkPut(remotos);
    }
  });
}

/** Obtiene clientes desde la caché local */
export async function getCachedClients() {
  return db.clients_cache.toArray();
}

/** Guarda todos los pagos en caché, PRESERVANDO datos locales pendientes */
export async function cachePayments(payments) {
  // FASE 2: Merge inteligente en lugar de clear() + bulkPut()
  await db.transaction('rw', db.payments_cache, async () => {
    // FASE 4: Merge Idempotente (Append-Only)
    // Ya no borramos los pagos locales si no vienen en la respuesta, 
    // preservando todo el historial masivo local intacto.
    if (payments && payments.length > 0) {
      const pending = await db.payments_cache.filter(p => p.status === 'pending').toArray();
      const pendingIds = new Set(pending.map(p => p.id));
      
      const remotos = payments.filter(p => !pendingIds.has(p.id));
      await db.payments_cache.bulkPut(remotos);
    }
  });
}

/** Obtiene pagos desde la caché local */
export async function getCachedPayments() {
  return db.payments_cache.toArray();
}

/** Obtiene pagos de un cliente desde la caché local */
export async function getCachedPaymentsByClient(clienteId) {
  return db.payments_cache.where('cliente_id').equals(clienteId).toArray();
}

/** Guarda pagos de hoy en caché */
export async function cacheTodayPayments(payments) {
  await db.transaction('rw', db.payments_today_cache, async () => {
    await db.payments_today_cache.clear();
    if (payments && payments.length > 0) {
      await db.payments_today_cache.bulkPut(payments);
    }
  });
}

/** Obtiene pagos de hoy desde caché */
export async function getCachedTodayPayments() {
  return db.payments_today_cache.toArray();
}

// ═══════════════════════════════════════════════════════════════
//  CACHÉ DE LUGARES
// ═══════════════════════════════════════════════════════════════

/** Guarda la lista de lugares en caché */
export async function cacheLugares(lugares) {
  await db.transaction('rw', db.lugares_cache, async () => {
    await db.lugares_cache.clear();
    if (lugares && lugares.length > 0) {
      const docs = lugares.map(n => ({ nombre: n }));
      await db.lugares_cache.bulkPut(docs);
    }
  });
}

/** Obtiene lugares desde caché */
export async function getCachedLugares() {
  const docs = await db.lugares_cache.toArray();
  return docs.map(d => d.nombre);
}

// ═══════════════════════════════════════════════════════════════
//  LOGS Y AUDITORÍA
// ═══════════════════════════════════════════════════════════════

/** Obtiene los últimos N logs */
export async function getRecentLogs(limit = 50) {
  return db.sync_logs.orderBy('id').reverse().limit(limit).toArray();
}

/** Limpia logs anteriores a una fecha */
export async function cleanOldLogs(daysOld = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffStr = cutoff.toISOString();
  await db.sync_logs.where('timestamp').below(cutoffStr).delete();
}

// ═══════════════════════════════════════════════════════════════
//  MIGRACIÓN DESDE LOCALSTORAGE
// ═══════════════════════════════════════════════════════════════

/** Migra datos existentes de localStorage a IndexedDB (una sola vez) */
export async function migrateFromLocalStorage() {
  const MIGRATION_KEY = 'dexie_migration_done_v1';
  if (localStorage.getItem(MIGRATION_KEY) === 'true') return;

  console.log('[Migration] Migrando datos de localStorage a IndexedDB...');

  try {
    // 1. Migrar cola offline
    const oldQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    for (const op of oldQueue) {
      await enqueue({
        type: op.type,
        data: op.data,
        client_ref: op.id || op.data?.cliente_id || null,
      });
    }
    if (oldQueue.length > 0) {
      console.log(`[Migration] ${oldQueue.length} operaciones migradas a sync_queue.`);
    }

    // 2. Migrar cola de Drive
    const oldDriveQueue = JSON.parse(localStorage.getItem('drive_sync_queue') || '[]');
    for (const op of oldDriveQueue) {
      await enqueueDrive({
        action: op.action,
        client_id: op.client_id,
        force: op.force,
        payment_data: op.payment_data,
        nombre: op.nombre,
        pasaje: op.pasaje,
        tipo_ahorro: op.tipo_ahorro,
      });
    }
    if (oldDriveQueue.length > 0) {
      console.log(`[Migration] ${oldDriveQueue.length} operaciones de Drive migradas.`);
    }

    // 3. Migrar caché de clientes
    const oldClients = JSON.parse(localStorage.getItem('clientes_cache') || '[]');
    if (oldClients.length > 0) {
      await cacheClients(oldClients);
      console.log(`[Migration] ${oldClients.length} clientes cacheados migrados.`);
    }

    // 4. Migrar caché de pagos
    const oldPayments = JSON.parse(localStorage.getItem('pagos_cache') || '[]');
    if (oldPayments.length > 0) {
      await cachePayments(oldPayments);
      console.log(`[Migration] ${oldPayments.length} pagos cacheados migrados.`);
    }

    // 5. Migrar pagos de hoy
    const oldTodayPayments = JSON.parse(localStorage.getItem('pagos_hoy_cache') || '[]');
    if (oldTodayPayments.length > 0) {
      await cacheTodayPayments(oldTodayPayments);
      console.log(`[Migration] ${oldTodayPayments.length} pagos de hoy migrados.`);
    }

    // Marcar migración como completa
    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[Migration] ✅ Migración completada exitosamente.');

    // Limpiar localStorage viejo (mantener las claves de auth y config)
    ['offline_queue', 'drive_sync_queue', 'clientes_cache', 'pagos_cache', 'pagos_hoy_cache'].forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('[Migration] 🧹 localStorage limpiado.');

  } catch (err) {
    console.error('[Migration] ❌ Error durante la migración:', err);
    // No marcar como completada para reintentar
  }
}
