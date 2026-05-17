import { supabase } from './lib/supabase';
import db, {
    enqueue, dequeueNext, markSyncing, markSuccess, markError, requeueErrors, requeueStale,
    getPendingCount, getDrivePendingCount, getAllQueueOps, remapClientIds,
    enqueueDrive, drainDriveQueue, removeDriveOps,
    cacheClients, getCachedClients,
    cachePayments, getCachedPayments, getCachedPaymentsByClient,
    cacheTodayPayments, getCachedTodayPayments,
    cacheLugares, getCachedLugares,
    migrateFromLocalStorage, getRecentLogs,
    SYNC_STATUS,
} from './lib/dexie';

// Re-exportar para uso externo
export { supabase, getPendingCount, getDrivePendingCount, getRecentLogs, migrateFromLocalStorage, requeueErrors, SYNC_STATUS };

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyALovaWTucRUyfz1cVmxu0fZPMZBXcdJrM2n6sbFN5SQpmnhKe_t725A9UsMLLLiyM/exec';

// Guard de sincronización (Bug 2 fix: declarado explícitamente)
let isSyncing = false;
// FASE 2: Tracker de última sincronización completada para cooldown
let _lastSyncComplete = 0;

// Helper para detectar conexión real
export function isUserOnline() {
    return navigator.onLine;
}

// Verificación real de conectividad (ping a Supabase)
let _lastOnlineCheck = 0;
let _lastOnlineResult = navigator.onLine;
export async function checkRealConnectivity(force = false) {
    const now = Date.now();
    // No verificar más de una vez cada 2 segundos (a menos que sea forzado)
    if (!force && now - _lastOnlineCheck < 2000) return _lastOnlineResult;
    _lastOnlineCheck = now;
    if (!navigator.onLine) { _lastOnlineResult = false; return false; }
    try {
        const resp = await fetchWithTimeout(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, { 
            method: 'HEAD', 
            headers: { 
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            timeout: 5000
        });
        _lastOnlineResult = resp.ok || (resp.status >= 200 && resp.status < 500); 
        return _lastOnlineResult;
    } catch {
        _lastOnlineResult = false;
        return false;
    }
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 30000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(id);
    }
}

const recentlyDeletedIds = new Set();

/**
 * Genera un ID único (UUID) para cada registro local.
 * Se usa el prefijo 'local-' para mantener compatibilidad con el resto de la app.
 */
function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function addToQueue(operation) {
    // El id_local para Dexie puede tener el prefijo 'local-'
    // Pero el id en data DEBE ser un UUID limpio para Supabase
    const id_local = operation.id_local || `local-${generateId()}`;
    await enqueue({
        type: operation.type,
        data: operation.data,
        id_ref: operation.id_ref || operation.id || null,
        client_ref: operation.client_ref || operation.data?.cliente_id || null,
        id_local,
    });
}


/**
 * Helper para identificar si un ID es local (aún no sincronizado)
 */
function isLocalId(id) {
    if (!id) return false;
    const s = String(id);
    return s.startsWith('local-') || s.startsWith('id-') || s.length > 30; // UUIDs suelen ser > 30 chars
}

async function resolveClientMeta(clientId) {
    try {
        if (isUserOnline() && clientId && !isLocalId(clientId)) {
            const { data } = await supabase.from('ahorros_clientes').select('nombre, pasaje, tipo_ahorro').eq('id', clientId).single();
            if (data) return data;
        }
    } catch (e) {}
    const cached = await getCachedClients();
    const found = cached.find(c => c.id === clientId);
    return found ? { nombre: found.nombre, pasaje: found.pasaje, tipo_ahorro: found.tipo_ahorro } : { nombre: null, pasaje: null, tipo_ahorro: null };
}


/**
 * Motor Experto: Maneja una cola persistente para Google Drive.
 * Si falla, se queda guardado para el siguiente inicio de la App.
 */
let isDriveSyncing = false;
async function processDriveQueue() {
    if (!isUserOnline() || isDriveSyncing) return;
    const pending = await db.drive_queue.toArray();
    if (pending.length === 0) {
        window.dispatchEvent(new CustomEvent('offline-queue-updated', { 
            detail: { count: await getTotalPendingCount() } 
        }));
        return;
    }

    isDriveSyncing = true;
    console.log(`[DriveSync] Procesando mochila de respaldo: ${pending.length} pendientes.`);
    
    // Agrupamos por cliente para no enviar 100 peticiones
    const clients = new Map();
    pending.forEach(p => {
        const key = p.client_id;
        if (!clients.has(key)) {
            clients.set(key, { action: p.action, id: p.client_id, name: p.client_name });
        } else if (p.action === 'delete_client') {
            clients.set(key, { action: 'delete_client', id: p.client_id, name: p.client_name });
        }
    });

    const operations = Array.from(clients.values()).map(c => ({
        action: c.action || 'sync_client',
        client_id: String(c.id).replace('local-', ''),
        client_name: c.name
    }));

    try {
        await fetch(GOOGLE_SCRIPT_URL, { 
            method: 'POST', 
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ batch: true, operations })
        });
        
        // Si llegamos aquí, borramos de la mochila
        const ids = pending.map(p => p.id);
        await db.drive_queue.bulkDelete(ids);
        console.log('[DriveSync] ¡Mochila vaciada con éxito!');
        window.dispatchEvent(new CustomEvent('drive-sync-success'));
    } catch (err) {
        console.error('[DriveSync] Error al vaciar mochila, se reintentará luego:', err);
    } finally {
        isDriveSyncing = false;
        window.dispatchEvent(new CustomEvent('offline-queue-updated', { 
            detail: { count: await getTotalPendingCount() } 
        }));
    }
}

export async function forceSyncClientToGoogleDrive(clientId) {
    await db.drive_queue.add({
        client_id: clientId,
        action: 'sync_client',
        timestamp: Date.now()
    });
    processDriveQueue();
    return true;
}

// Iniciar proceso de vaciado de mochila al cargar y al volver a estar online
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        processDriveQueue();
        syncOfflineData();
    });

    // EXPERTO: Sincronizar automáticamente cuando el usuario vuelve a la App
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('[AutoSync] Usuario regresó a la App, activando sincronización...');
            processDriveQueue();
            syncOfflineData();
        }
    });

    // NOTA: El intervalo de sincronización periódica se maneja únicamente desde App.jsx (cada 15s)
    // para evitar race conditions por doble sync concurrente.

    // Ejecutar al inicio tras un breve delay
    setTimeout(() => {
        processDriveQueue();
        syncOfflineData();
    }, 3000);
}

export async function clearSyncQueue() {
    try {
        await db.sync_queue.clear();
        await db.drive_queue.clear();
        window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: 0 } }));
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * RUTINA DE AUTOCURACIÓN (Expert Repair)
 * Busca ítems trabados y verifica si ya existen en la nube para limpiarlos.
 */
export async function repairSyncQueue() {
    if (!isUserOnline()) return;
    
    try {
        const queue = await getAllQueueOps();
        const problematic = queue.filter(op => 
            op.status === SYNC_STATUS.ERROR || 
            (op.status === SYNC_STATUS.SYNCING && Date.now() - new Date(op.created_at).getTime() > 60000)
        );

        if (problematic.length === 0) return;

        console.log(`[AutoRepair] Iniciando revisión de ${problematic.length} ítems trabados...`);

        for (const op of problematic) {
            const cleanId = String(op.id_local || op.id_ref).replace('local-', '');
            let exists = false;

            try {
                if (op.type === 'INSERT_CLIENTE' || op.type === 'UPDATE_CLIENTE') {
                    const { data } = await supabase.from('ahorros_clientes').select('id').eq('id', cleanId).single();
                    if (data) exists = true;
                } else if (op.type === 'INSERT_PAGO') {
                    const { data } = await supabase.from('ahorros_pagos').select('id').eq('id', cleanId).single();
                    if (data) exists = true;
                }

                if (exists) {
                    console.log(`[AutoRepair] Ítem ${op.id} (${op.type}) ya existe en la nube. Limpiando...`);
                    await markSuccess(op.id);
                } else if (op.status === SYNC_STATUS.ERROR) {
                    // Si no existe y es un error, lo devolvemos a PENDING para que el motor normal lo intente
                    console.log(`[AutoRepair] Re-intentando ítem ${op.id} (${op.type})...`);
                    await db.sync_queue.update(op.id, { status: SYNC_STATUS.PENDING });
                }
            } catch (e) {
                // Error de red o query, ignoramos este ítem por ahora
            }
        }
        
        const finalCount = await getTotalPendingCount();
        window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: finalCount } }));
    } catch (err) {
        console.error('[AutoRepair] Error crítico en rutina:', err);
    }
}

export async function syncOfflineData() {
    if (!isUserOnline()) return { synced: 0, failed: 0 };
    
    // Recuperar operaciones zombie (atascadas en 'syncing' por más de 60s)
    await requeueStale(60000);

    // RUTINA DE AUTOCURACIÓN
    await repairSyncQueue();

    // Auto-desbloqueo de emergencia (más agresivo: 30s)
    if (isSyncing && Date.now() - (window._lastSyncStart || 0) > 30000) {
        isSyncing = false;
    }
    
    if (isSyncing) return { synced: 0, failed: 0 };

    isSyncing = true;
    window._lastSyncStart = Date.now();
    let synced = 0;
    let failed = 0;
    const clientsToSyncToSheets = new Set();

    try {
        // Solo reintentamos errores 3 veces para no trabar la App
        await requeueErrors(3);
        const idMap = {};
        const totalInitial = await getPendingCount();
        
        window.dispatchEvent(new CustomEvent('sync-progress', { 
            detail: { remaining: totalInitial, total: totalInitial, phase: 'start' } 
        }));

        let loopLimit = 1000; // FASE 4: Permitir sincronización masiva de hasta 1000 operaciones por ciclo
        let consecutiveErrors = 0;

        while (loopLimit > 0) {
            loopLimit--;
            const op = await dequeueNext();
            if (!op) break;

            if (consecutiveErrors >= 5) {
                console.warn('[Sync] Demasiados errores consecutivos, abortando ciclo actual.');
                break;
            }

            await markSyncing(op.id);
            try {
                let res;
                // Remapear IDs
                if (op.data?.cliente_id && idMap[op.data.cliente_id]) op.data.cliente_id = idMap[op.data.cliente_id];
                if (op.id_ref && idMap[op.id_ref]) op.id_ref = idMap[op.id_ref];

                if (op.type === 'INSERT_CLIENTE') {
                    const cleanId = String(op.id_local).replace('local-', '');
                    res = await supabase.from('ahorros_clientes').upsert([{ ...op.data, id: cleanId }]).select().single();
                    if (!res.error && res.data) {
                        idMap[op.id_local] = res.data.id;
                        await remapClientIds(op.id_local, res.data.id);
                        // Reemplazar cliente local (pending) por el real de Supabase
                        await db.clients_cache.delete(op.id_local);
                        await db.clients_cache.put(mapCliente(res.data));
                        clientsToSyncToSheets.add(res.data.id);
                    }
                } else if (op.type === 'INSERT_PAGO') {
                    let cId = op.data.cliente_id;
                    if (isLocalId(cId) && idMap[cId]) cId = idMap[cId];
                    const cleanCId = String(cId).replace('local-', '');
                    const cleanId = String(op.id_local).replace('local-', '');
                    
                    const paymentData = { ...op.data, id: cleanId, cliente_id: cleanCId };
                    
                    // FASE 3: Escudo Multi-Dispositivo (Deduplicación remota)
                    // Verificar si otro celular ya guardó este mismo pago lógico
                    const { data: existing } = await supabase.from('ahorros_pagos')
                        .select('id')
                        .eq('cliente_id', cleanCId)
                        .eq('monto', paymentData.monto)
                        .eq('fecha', paymentData.fecha)
                        .eq('tipo', paymentData.tipo)
                        .maybeSingle();

                    if (existing) {
                        console.warn(`[FASE3] ⛔ Pago bloqueado: Ya fue registrado por otro dispositivo (ID: ${existing.id})`);
                        // Simulamos éxito borrando el registro pendiente local problemático
                        if (op.id_local) await db.payments_cache.delete(op.id_local);
                        // No lo mandamos a Excel de nuevo porque ya debería estar o se enviará con otro sync
                    } else {
                        res = await supabase.from('ahorros_pagos').insert([paymentData]);
                        
                        if (!res?.error) {
                            // FASE 3: Corrección del bug de IndexedDB. 
                            // No se puede hacer 'update' a una llave primaria. Se debe hacer delete + put.
                            if (op.id_local) {
                                await db.payments_cache.delete(op.id_local);
                                await db.payments_cache.put({ ...paymentData });
                            }
                            clientsToSyncToSheets.add(cleanCId);
                        }
                    }
                } else if (op.type === 'UPDATE_CLIENTE') {
                    res = await supabase.from('ahorros_clientes').update(op.data).eq('id', op.id_ref);
                    if (!res?.error) clientsToSyncToSheets.add(op.id_ref);
                } else if (op.type === 'DELETE_CLIENTE') {
                    const targetId = op.id_ref || String(op.id_local).replace('local-', '');
                    res = await supabase.from('ahorros_clientes').delete().eq('id', targetId);
                    if (!res?.error) clientsToSyncToSheets.add({ id: targetId, action: 'delete_client', name: op.data?.nombre });
                } else if (op.type === 'DELETE_PAGO') {
                    const targetId = op.id_ref || String(op.id_local).replace('local-', '');
                    res = await supabase.from('ahorros_pagos').delete().eq('id', targetId);
                    if (!res?.error && op.data?.cliente_id) clientsToSyncToSheets.add(op.data.cliente_id);
                } else if (op.type === 'INSERT_LUGAR') {
                    res = await supabase.from('ahorros_lugares').upsert([{ nombre: op.data.nombre }], { onConflict: 'nombre' });
                } else if (op.type === 'DELETE_LUGAR') {
                    res = await supabase.from('ahorros_lugares').delete().eq('nombre', op.data.nombre);
                }

                if (res?.error && res.error.code !== '23505') throw res.error;
                
                await markSuccess(op.id);
                synced++;
                consecutiveErrors = 0; // Resetear contador al tener éxito
            } catch (err) {
                console.error(`[Sync] Falló op ${op.id}, saltando...`, err);
                await markError(op.id, err.message || String(err));
                failed++;
                consecutiveErrors++;
                continue; 
            }
        }

        if (clientsToSyncToSheets.size > 0) {
            for (const item of clientsToSyncToSheets) {
                const clientObj = typeof item === 'string' ? { id: item, action: 'sync_client' } : item;
                await db.drive_queue.add({
                    client_id: clientObj.id,
                    action: clientObj.action,
                    client_name: clientObj.name,
                    timestamp: Date.now()
                });
            }
            processDriveQueue();
        }
        
    } catch (err) {
        console.error('[Sync] Error crítico:', err);
    } finally {
        isSyncing = false;
        // FASE 2: Registrar cuándo terminó la sincronización para el cooldown
        _lastSyncComplete = Date.now();
        window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: await getTotalPendingCount() } }));
    }
    return { synced, failed };
}

export async function getTotalPendingCount() {
    try {
        const sup = await getPendingCount();
        const drive = await db.drive_queue.count();
        return sup + drive;
    } catch (e) { return 0; }
}

function mapCliente(c) {
    if (!c) return null;
    return { ...c, tipoAhorro: c.tipo_ahorro, fechaRegistro: c.fecha_register || c.fecha_registro, montoNormal: c.monto_normal, montoPuesto: c.monto_puesto };
}

export async function getClientesConMetaData() {
    let clients = [];
    let payments = [];
    const today = getLocalIsoDate();
    
    try {
        // EXPERTO: Siempre preferimos la base local para rapidez, 
        // y actualizamos desde Supabase en segundo plano sin bloquear la UI.
        const cachedClients = await getCachedClients();
        const cachedPayments = await getCachedPayments();
        
        if (isUserOnline()) {
            // SEGURIDAD y FASE 2: Solo refrescar caché si NO hay operaciones pendientes
            // Y además han pasado al menos 5 segundos desde la última sincronización
            // para dar tiempo a que Supabase propague los datos.
            const pendingOps = await getPendingCount();
            const sinceSyncComplete = Date.now() - _lastSyncComplete;
            
            if (pendingOps === 0 && sinceSyncComplete > 5000) {
                // FASE 4: Carga optimizada. Solo trae los más recientes (hasta 1000). 
                // El caché local Append-Only retiene todo el historial antiguo sin borrarlo.
                supabase.from('ahorros_clientes').select('*').order('id', {ascending: false}).limit(1000).then(({data}) => data && cacheClients(data.map(mapCliente)));
                supabase.from('ahorros_pagos').select('id, cliente_id, monto, tipo, fecha, hora, fecha_pago_real').order('fecha', {ascending: false}).limit(1000).then(({data}) => data && cachePayments(data));
            } else if (pendingOps === 0 && sinceSyncComplete <= 5000) {
                console.log(`[FASE2] Cooldown de refresh activo (${sinceSyncComplete}ms), omitiendo fetch para proteger caché.`);
            }
        }
        
        clients = cachedClients.length > 0 ? cachedClients : [];
        payments = cachedPayments.length > 0 ? cachedPayments : [];
    } catch (err) {
        clients = await getCachedClients();
        payments = await getCachedPayments();
    }

    const queue = await getAllQueueOps();
    const deletions = new Set(queue.filter(op => op.type === 'DELETE_CLIENTE').map(op => op.id_ref));
    const updates = queue.filter(op => op.type === 'UPDATE_CLIENTE');
    const newClients = queue.filter(op => op.type === 'INSERT_CLIENTE');
    const newPagos = queue.filter(op => op.type === 'INSERT_PAGO');
    const deletedPagos = new Set(queue.filter(op => op.type === 'DELETE_PAGO').map(op => op.id_ref));

    // Combinar pagos (Base + Cola - Borrados - Duplicados)
    const pendingPagoIds = new Set(newPagos.map(op => op.id_local));
    const allPayments = [
        ...payments.filter(p => {
            if (deletedPagos.has(p.id)) return false;
            // Si el pago es un ID local y ya está en la cola, evitamos duplicar lo que ya viene de Supabase
            if (isLocalId(p.id) && pendingPagoIds.has(p.id)) return false;
            return true;
        }),
        ...newPagos.map(op => ({ ...op.data, id: op.id_local, status: 'pending' }))
    ];

    // Calcular totales
    const totals = allPayments.reduce((acc, p) => {
        if (!acc[p.cliente_id]) acc[p.cliente_id] = { total: 0, normal: 0, puesto: 0, payToday: new Set() };
        const m = Number(p.monto);
        acc[p.cliente_id].total += m;
        if (p.tipo === 'puesto') acc[p.cliente_id].puesto += m; else acc[p.cliente_id].normal += m;
        if (p.fecha_pago_real === today) acc[p.cliente_id].payToday.add(p.tipo || 'normal');
        return acc;
    }, {});

    // Bug 4 fix: helper para calcular pagadoHoy y statusHoy
    function computeStatus(tipoAhorro, tiposPagadosHoy) {
        const pagosSet = new Set(tiposPagadosHoy);
        if (tipoAhorro === 'ambos') {
            const hasNormal = pagosSet.has('normal');
            const hasPuesto = pagosSet.has('puesto');
            if (hasNormal && hasPuesto) return { pagadoHoy: true, statusHoy: 'VERDE' };
            if (hasNormal || hasPuesto) return { pagadoHoy: false, statusHoy: 'AMARILLO' };
            return { pagadoHoy: false, statusHoy: 'ROJO' };
        }
        const expected = tipoAhorro === 'puesto' ? 'puesto' : 'normal';
        if (pagosSet.has(expected)) return { pagadoHoy: true, statusHoy: 'VERDE' };
        return { pagadoHoy: false, statusHoy: 'ROJO' };
    }

    // Combinar clientes
    const pendingClientIds = new Set(newClients.map(nc => nc.id_local));
    let merged = clients.filter(c => !deletions.has(c.id) && !recentlyDeletedIds.has(c.id) && !pendingClientIds.has(c.id)).map(c => {
        const up = updates.find(op => op.id_ref === c.id);
        const base = up ? { ...c, ...up.data } : c;
        const stats = totals[c.id] || { total: 0, payToday: new Set() };
        const mapped = mapCliente(base);
        const tiposPagadosHoy = Array.from(stats.payToday);
        const { pagadoHoy, statusHoy } = computeStatus(mapped.tipoAhorro || 'normal', tiposPagadosHoy);
        return { 
            ...mapped, 
            totalAcumulado: stats.total, 
            totalNormal: stats.normal,
            totalPuesto: stats.puesto,
            tiposPagadosHoy, 
            pagadoHoy, 
            statusHoy 
        };
    });

    newClients.forEach(nc => {
        const stats = totals[nc.id_local] || { total: 0, normal: 0, puesto: 0, payToday: new Set() };
        const mapped = mapCliente(nc.data);
        const tiposPagadosHoy = Array.from(stats.payToday);
        const { pagadoHoy, statusHoy } = computeStatus(mapped.tipoAhorro || 'normal', tiposPagadosHoy);
        merged.push({ 
            ...mapped, 
            id: nc.id_local, 
            status: 'pending', 
            totalAcumulado: stats.total, 
            totalNormal: stats.normal,
            totalPuesto: stats.puesto,
            tiposPagadosHoy, 
            pagadoHoy, 
            statusHoy 
        });
    });

    return merged.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function addCliente(data) {
    const uuid = generateId();
    const lid = `local-${uuid}`;
    const nuevo = { 
        id: uuid,
        nombre: data.nombre.trim(), 
        puesto: data.puesto?.trim().toUpperCase() || '', 
        pasaje: data.pasaje?.trim() || '', 
        lugar: data.lugar?.trim() || '', 
        tipo_ahorro: data.tipoAhorro || 'normal', 
        telefono: data.telefono?.trim() || '', 
        fecha_registro: data.fechaRegistro || getLocalIsoDate(), 
        monto_normal: data.montoNormal || null, 
        monto_puesto: data.montoPuesto || null 
    };
    await db.clients_cache.put({ ...nuevo, id: lid, status: 'pending' });
    await addToQueue({ type: 'INSERT_CLIENTE', data: nuevo, id_local: lid });

    // Persistencia automática de lugar si es nuevo
    if (nuevo.lugar) {
        const existentes = await getCachedLugares();
        if (!existentes.includes(nuevo.lugar)) {
            await addLugar(nuevo.lugar);
        }
    }

    return { ...nuevo, id: lid, status: 'pending' };
}

export async function updateCliente(id, data) {
    const updates = { nombre: data.nombre?.trim(), puesto: data.puesto?.trim().toUpperCase(), pasaje: data.pasaje?.trim(), lugar: data.lugar?.trim(), tipo_ahorro: data.tipoAhorro, telefono: data.telefono?.trim(), fecha_registro: data.fechaRegistro, monto_normal: data.montoNormal, monto_puesto: data.montoPuesto };
    Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
    await db.clients_cache.update(id, updates);
    await addToQueue({ type: 'UPDATE_CLIENTE', id_ref: id, data: updates });

    // Persistencia automática de lugar si es nuevo
    if (updates.lugar) {
        const existentes = await getCachedLugares();
        if (!existentes.includes(updates.lugar)) {
            await addLugar(updates.lugar);
        }
    }

    return { id, ...updates, status: 'pending' };
}

// FASE 1: Lock anti-ejecución concurrente para addPago
let _addPagoLock = false;
// FASE 1: Registro de pagos recientes para deduplicación por ventana de tiempo
const _recentPagoKeys = new Map(); // key -> timestamp

export async function addPago(data) {
    // FASE 1: Bloquear ejecución concurrente (doble clic rápido)
    if (_addPagoLock) {
        console.warn('[FASE1-DEDUP] ⛔ addPago bloqueado: otra operación en progreso.');
        return null;
    }
    _addPagoLock = true;

    try {
        const today = getLocalIsoDate();
        const now = new Date();
        // FASE 1: Precisión de segundos en vez de minutos
        const hora = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const tipoActual = data.tipo || 'normal';
        const fechaPago = data.fechaPersonalizada || today;

        // FASE 1: Ventana de deduplicación de 30 segundos
        // Clave lógica: mismo cliente + mismo monto + misma fecha + mismo tipo
        const dedupKey = `${data.clienteId}|${Number(data.monto)}|${fechaPago}|${tipoActual}`;
        const lastTime = _recentPagoKeys.get(dedupKey);
        if (lastTime && (Date.now() - lastTime) < 30000) {
            console.warn(`[FASE1-DEDUP] ⛔ Pago bloqueado por ventana de 30s. Key: ${dedupKey}, hace ${Date.now() - lastTime}ms`);
            return null;
        }
    
        // ESCUDO ORIGINAL MEJORADO: Verificar en la base local con precisión de segundos
        const recientes = await getPagosByCliente(data.clienteId);
        const duplicado = recientes.find(p => 
            p.monto === Number(data.monto) && 
            p.fecha === fechaPago && 
            p.hora === hora &&
            p.tipo === tipoActual
        );
        if (duplicado) {
            console.warn(`[FASE1-DEDUP] ⛔ Pago duplicado exacto encontrado en DB local. ID: ${duplicado.id}`);
            return duplicado.id;
        }

        // Registrar en ventana de deduplicación ANTES de escribir
        _recentPagoKeys.set(dedupKey, Date.now());
        // Limpiar entradas viejas (>60s) para no acumular memoria
        for (const [k, t] of _recentPagoKeys) {
            if (Date.now() - t > 60000) _recentPagoKeys.delete(k);
        }

        const uuid = generateId();
        const lid = `local-${uuid}`;
        const nuevo = { 
            id: uuid,
            cliente_id: data.clienteId, 
            tipo: data.tipo || 'normal', 
            monto: Number(data.monto), 
            fecha: fechaPago, 
            fecha_pago_real: today,
            hora: hora, 
            nota: data.nota || '' 
        };

        console.log(`[FASE1-DEDUP] ✅ Pago aceptado: ${nuevo.monto} soles, cliente ${data.clienteId}, fecha ${fechaPago}, tipo ${tipoActual}, id ${lid}`);

        await db.payments_cache.put({ ...nuevo, id: lid, status: 'pending' });
        await addToQueue({ type: 'INSERT_PAGO', data: nuevo, id_local: lid });
        return { ...nuevo, id: lid, status: 'pending' };
    } finally {
        _addPagoLock = false;
    }
}

export async function deleteCliente(id) {
    if (!id) return;
    recentlyDeletedIds.add(id);
    const meta = await resolveClientMeta(id);
    await db.clients_cache.delete(id);
    await db.payments_cache.where('cliente_id').equals(id).delete();
    await db.drive_queue.where('client_id').equals(id).delete();
    await addToQueue({ type: 'DELETE_CLIENTE', id_ref: id, data: meta });
    return true;
}

export async function deletePago(id, data) {
    await db.payments_cache.delete(id);
    await addToQueue({ type: 'DELETE_PAGO', id_ref: id, data });
    return true;
}

export async function getPagosByCliente(clienteId) {
    const cached = await getCachedPaymentsByClient(clienteId);
    const queue = await getAllQueueOps();
    const deleted = new Set(queue.filter(op => op.type === 'DELETE_PAGO').map(op => op.id_ref));
    const pending = queue.filter(op => op.type === 'INSERT_PAGO' && op.data.cliente_id === clienteId).map(op => ({ ...op.data, id: op.id_local, status: 'pending' }));
    
    const pendingIds = new Set(pending.map(p => p.id));
    const finalPagos = [...pending, ...cached.filter(p => !deleted.has(p.id) && !pendingIds.has(p.id))];
    
    return finalPagos.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora || '').localeCompare(a.hora || ''));
}

export async function getTotalesByCliente(clienteId) {
    const pagos = await getPagosByCliente(clienteId);
    const n = pagos.filter(p => p.tipo === 'normal').reduce((s, p) => s + Number(p.monto), 0);
    const p = pagos.filter(p => p.tipo === 'puesto').reduce((s, p) => s + Number(p.monto), 0);
    return { normal: n, puesto: p, total: n + p };
}

export async function getClientes() {
    try {
        const { data } = await supabase.from('ahorros_clientes').select('*').order('nombre');
        return data?.map(mapCliente) || await getCachedClients();
    } catch (e) { return await getCachedClients(); }
}

export async function getPagos() {
    try {
        const { data } = await supabase.from('ahorros_pagos').select('*').order('fecha', { ascending: false });
        return data || await getCachedPayments();
    } catch (e) { return await getCachedPayments(); }
}

export async function getLugares() {
    let base = [];
    try {
        if (isUserOnline()) {
            const { data } = await supabase.from('ahorros_lugares').select('nombre').order('nombre');
            if (data) {
                base = data.map(l => l.nombre);
                await cacheLugares(base);
            } else {
                base = await getCachedLugares();
            }
        } else {
            base = await getCachedLugares();
        }
    } catch (e) {
        base = await getCachedLugares();
    }

    // Fusionar con la cola de sincronización para que la UI sea instantánea
    const queue = await getAllQueueOps();
    const deleted = new Set(queue.filter(op => op.type === 'DELETE_LUGAR').map(op => op.data.nombre));
    const added = queue.filter(op => op.type === 'INSERT_LUGAR').map(op => op.data.nombre);

    const merged = [
        ...base.filter(n => !deleted.has(n)),
        ...added.filter(n => !base.includes(n))
    ];

    // Eliminar duplicados y ordenar
    return Array.from(new Set(merged)).sort((a, b) => a.localeCompare(b));
}

export async function addLugar(nombre) {
    const clean = nombre.trim();
    if (!clean) return;
    // Persistencia local inmediata para UX
    await db.lugares_cache.put({ nombre: clean });
    await addToQueue({ type: 'INSERT_LUGAR', data: { nombre: clean } });
}

export async function deleteLugar(nombre) {
    // 1. Verificar si está en uso por clientes en caché local
    const inUse = await db.clients_cache.where('lugar').equals(nombre).count();
    if (inUse > 0) return false;

    // 2. Eliminar de caché local inmediatamente
    await db.lugares_cache.delete(nombre);

    // 3. Sincronizar eliminación
    await addToQueue({ type: 'DELETE_LUGAR', data: { nombre } });
    return true;
}

// Bug 6 fix: obtener todos los pagos fusionados con cola offline
export async function getAllPagosMerged() {
    let payments = [];
    try {
        if (!isUserOnline()) throw new Error('Offline');
        const { data: dbP } = await supabase.from('ahorros_pagos').select('*, fecha_pago_real').order('fecha', { ascending: false });
        payments = dbP || [];
        await cachePayments(payments);
    } catch {
        payments = await getCachedPayments();
    }
    const queue = await getAllQueueOps();
    const deletedPagos = new Set(queue.filter(op => op.type === 'DELETE_PAGO').map(op => op.id_ref));
    const newPagos = queue.filter(op => op.type === 'INSERT_PAGO').map(op => ({ ...op.data, id: op.id_local, status: 'pending' }));
    // FIX DUPLICADOS: excluir de cache los pagos que ya están como pendientes en la cola
    const pendingIds = new Set(newPagos.map(p => p.id));
    return [
        ...payments.filter(p => !deletedPagos.has(p.id) && !pendingIds.has(p.id)),
        ...newPagos
    ];
}

function getLocalIsoDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

export function buscarClientes(clientes, query) {
    if (!query.trim()) return clientes;
    const q = query.toLowerCase().trim();
    return clientes.filter(c => c.nombre.toLowerCase().includes(q) || (c.puesto && c.puesto.toLowerCase().includes(q)) || (c.lugar && c.lugar.toLowerCase().includes(q)));
}
