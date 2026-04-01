// ─── OFFLINE SYNC SYSTEM ──────────────────────────────────────
const OFFLINE_QUEUE_KEY = 'offline_queue';

function getQueue() {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
}

function saveQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function addToQueue(operation) {
    const queue = getQueue();
    const id_local = (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    queue.push({ ...operation, id_local, timestamp: new Date().toISOString() });
    saveQueue(queue);
    
    // Disparar evento para que la UI se entere de que hay algo pendiente
    window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: queue.length } }));
}

export async function syncOfflineData() {
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    
    let queue = getQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    console.log(`Starting sync of ${queue.length} items...`);
    let synced = 0;
    let failed = 0;
    const remaining = [];
    
    // Mapeo de IDs locales a IDs reales de Supabase
    const idMap = {};

    for (const op of queue) {
        try {
            let res;
            
            // Si la operación depende de un cliente que se acaba de crear, actualizar su ID
            if (op.data && op.data.cliente_id && idMap[op.data.cliente_id]) {
                op.data.cliente_id = idMap[op.data.cliente_id];
            }
            if (op.id && idMap[op.id]) {
                op.id = idMap[op.id];
            }

            if (op.type === 'INSERT_CLIENTE') {
                res = await supabase.from('ahorros_clientes').insert([op.data]).select().single();
                if (!res.error && res.data) {
                    idMap[op.id_local] = res.data.id; // Mapear ID local al real
                }
            } else if (op.type === 'INSERT_PAGO') {
                res = await supabase.from('ahorros_pagos').insert([op.data]);
            } else if (op.type === 'UPDATE_CLIENTE') {
                res = await supabase.from('ahorros_clientes').update(op.data).eq('id', op.id);
            } else if (op.type === 'DELETE_CLIENTE') {
                res = await supabase.from('ahorros_clientes').delete().eq('id', op.id);
            } else if (op.type === 'DELETE_PAGO') {
                res = await supabase.from('ahorros_pagos').delete().eq('id', op.id);
            }

            if (res?.error) throw res.error;
            synced++;
        } catch (err) {
            console.error('Failed to sync operation:', op, err);
            remaining.push(op);
            failed++;
        }
    }

    saveQueue(remaining);
    window.dispatchEvent(new CustomEvent('offline-queue-updated', { detail: { count: remaining.length } }));
    return { synced, failed };
}

// ─── CLIENTES ────────────────────────────────────────────────
export async function getClientes() {
    const { data, error } = await supabase
        .from('ahorros_clientes')
        .select('*')
        .order('nombre');
    if (error) {
        console.error('Error fetching clientes:', error);
        return [];
    }
    return data.map(mapCliente);
}

function mapCliente(c) {
    if (!c) return null;
    return {
        ...c,
        tipoAhorro: c.tipo_ahorro,
        fechaRegistro: c.fecha_register || c.fecha_registro,
        montoNormal: c.monto_normal,
        montoPuesto: c.monto_puesto,
    };
}

export async function getClientesConMetaData() {
    let finalResult = [];
    const today = new Date().toISOString().split('T')[0];

    try {
        if (!navigator.onLine) throw new Error('Offline');
        
        const { data: clientes, error: errC } = await supabase
            .from('ahorros_clientes')
            .select('*')
            .order('nombre');
        if (errC) throw errC;

        const { data: pagosHoy, error: errP } = await supabase
            .from('ahorros_pagos')
            .select('cliente_id')
            .eq('fecha', today);
        if (errP) throw errP;

        const { data: todosLosPagos, error: errT } = await supabase
            .from('ahorros_pagos')
            .select('cliente_id, monto');
        if (errT) throw errT;

        const pagosHoySet = new Set(pagosHoy.map(p => p.cliente_id));
        const totalesMap = todosLosPagos.reduce((acc, p) => {
            acc[p.cliente_id] = (acc[p.cliente_id] || 0) + Number(p.monto);
            return acc;
        }, {});

        finalResult = clientes.map(c => ({
            ...mapCliente(c),
            pagadoHoy: pagosHoySet.has(c.id),
            totalAcumulado: totalesMap[c.id] || 0
        }));

        localStorage.setItem('clientes_cache', JSON.stringify(finalResult));
    } catch (err) {
        console.warn('Using cache for clientes:', err.message);
        const cache = localStorage.getItem('clientes_cache');
        finalResult = cache ? JSON.parse(cache) : [];
    }

    // ─── MEZCLA CON COLA OFFLINE ──────────────────────────────
    const queue = getQueue();
    if (queue.length === 0) return finalResult;

    const deletions = new Set(queue.filter(op => op.type === 'DELETE_CLIENTE').map(op => op.id));
    const updates = queue.filter(op => op.type === 'UPDATE_CLIENTE');
    const newClients = queue.filter(op => op.type === 'INSERT_CLIENTE');
    const newPagos = queue.filter(op => op.type === 'INSERT_PAGO');
    const deletedPagos = new Set(queue.filter(op => op.type === 'DELETE_PAGO').map(op => op.id));

    // 1. Filtrar eliminados y Aplicar updates
    let merged = finalResult
        .filter(c => !deletions.has(c.id))
        .map(c => {
            const up = updates.find(op => op.id === c.id);
            if (up) {
                return { ...c, ...mapCliente({ ...c, ...up.data }) };
            }
            return c;
        });

    // 2. Agregar nuevos clientes pendientes
    newClients.forEach(nc => {
        merged.push({
            ...mapCliente(nc.data),
            id: nc.id_local,
            status: 'pending',
            pagadoHoy: false,
            totalAcumulado: 0
        });
    });

    // 3. Recalcular totales con pagos pendientes
    merged = merged.map(c => {
        const pendingPagos = newPagos.filter(op => op.data.cliente_id === c.id);
        const extraMonto = pendingPagos.reduce((s, op) => s + Number(op.data.monto), 0);
        const extraPagadoHoy = pendingPagos.some(op => op.data.fecha === today);
        
        return {
            ...c,
            totalAcumulado: c.totalAcumulado + extraMonto,
            pagadoHoy: c.pagadoHoy || extraPagadoHoy
        };
    });

    return merged;
}

export async function addCliente(data) {
    const nuevo = {
        nombre: data.nombre.trim(),
        puesto: data.puesto ? data.puesto.trim().toUpperCase() : '',
        pasaje: data.pasaje ? data.pasaje.trim() : '',
        lugar: data.lugar ? data.lugar.trim() : '',
        tipo_ahorro: data.tipoAhorro || 'normal',
        telefono: data.telefono ? data.telefono.trim() : '',
        fecha_registro: data.fechaRegistro || new Date().toISOString().split('T')[0],
        monto_normal: data.montoNormal || null,
        monto_puesto: data.montoPuesto || null,
    };

    if (!navigator.onLine) {
        addToQueue({ type: 'INSERT_CLIENTE', data: nuevo });
        return { ...nuevo, id: `local-${Date.now()}`, status: 'pending' };
    }

    try {
        const { data: insertedData, error } = await supabase
            .from('ahorros_clientes')
            .insert([nuevo])
            .select()
            .single();
        if (error) throw error;
        if (nuevo.lugar) await addLugar(nuevo.lugar);
        return insertedData;
    } catch (err) {
        addToQueue({ type: 'INSERT_CLIENTE', data: nuevo });
        return { ...nuevo, id: `local-${Date.now()}`, status: 'pending' };
    }
}

export async function updateCliente(id, data) {
    const updates = { ...data };
    if (updates.tipoAhorro) { updates.tipo_ahorro = updates.tipoAhorro; delete updates.tipoAhorro; }
    if (updates.fechaRegistro) { updates.fecha_registro = updates.fechaRegistro; delete updates.fechaRegistro; }
    if (updates.montoNormal !== undefined) { updates.monto_normal = updates.montoNormal; delete updates.montoNormal; }
    if (updates.montoPuesto !== undefined) { updates.monto_puesto = updates.montoPuesto; delete updates.montoPuesto; }

    if (!navigator.onLine) {
        addToQueue({ type: 'UPDATE_CLIENTE', id, data: updates });
        return { id, ...updates, status: 'pending' };
    }

    const { data: updatedData, error } = await supabase
        .from('ahorros_clientes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return updatedData;
}

export async function addPago(data) {
    const nuevo = {
        cliente_id: data.clienteId,
        tipo: data.tipo || 'normal',
        monto: Number(data.monto),
        fecha: data.fechaPersonalizada || new Date().toISOString().split('T')[0],
        hora: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        nota: data.nota || '',
    };

    if (!navigator.onLine) {
        addToQueue({ type: 'INSERT_PAGO', data: nuevo });
        return { ...nuevo, status: 'pending' };
    }

    try {
        const { data: insertedData, error } = await supabase
            .from('ahorros_pagos')
            .insert([nuevo])
            .select()
            .single();
        if (error) throw error;
        return insertedData;
    } catch (err) {
        addToQueue({ type: 'INSERT_PAGO', data: nuevo });
        return { ...nuevo, status: 'pending' };
    }
}

export async function deleteCliente(id) {
    if (!navigator.onLine) {
        addToQueue({ type: 'DELETE_CLIENTE', id });
        return;
    }
    const { error } = await supabase.from('ahorros_clientes').delete().eq('id', id);
    if (error) throw error;
}

export async function deletePago(id) {
    if (!navigator.onLine) {
        addToQueue({ type: 'DELETE_PAGO', id });
        return;
    }
    const { error } = await supabase.from('ahorros_pagos').delete().eq('id', id);
    if (error) throw error;
}

export async function getPagos() {
    let data = [];
    if (navigator.onLine) {
        const res = await supabase.from('ahorros_pagos').select('*').order('fecha', { ascending: false });
        data = res.error ? [] : res.data;
    }
    
    // Mezclar con nuevos pagos offline
    const queue = getQueue();
    const newPagos = queue.filter(op => op.type === 'INSERT_PAGO').map(op => ({ ...op.data, id: op.id_local, status: 'pending' }));
    const deletedPagos = new Set(queue.filter(op => op.type === 'DELETE_PAGO').map(op => op.id));
    
    return [...newPagos, ...data.filter(p => !deletedPagos.has(p.id))];
}

export async function getPagosByCliente(clienteId) {
    let data = [];
    if (navigator.onLine && !String(clienteId).startsWith('local-')) {
        const res = await supabase.from('ahorros_pagos').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: false });
        data = res.error ? [] : res.data;
    }

    const queue = getQueue();
    const newPagos = queue
        .filter(op => op.type === 'INSERT_PAGO' && op.data.cliente_id === clienteId)
        .map(op => ({ ...op.data, id: op.id_local, status: 'pending' }));
    const deletedPagos = new Set(queue.filter(op => op.type === 'DELETE_PAGO').map(op => op.id));

    return [...newPagos, ...data.filter(p => !deletedPagos.has(p.id))];
}

export async function getTotalesByCliente(clienteId) {
    const pagos = await getPagosByCliente(clienteId);
    const normal = pagos.filter(p => p.tipo === 'normal').reduce((sum, p) => sum + Number(p.monto), 0);
    const puesto = pagos.filter(p => p.tipo === 'puesto').reduce((sum, p) => sum + Number(p.monto), 0);
    return { normal, puesto, total: normal + puesto };
}

export async function getLugares() {
    const { data, error } = await supabase.from('ahorros_lugares').select('nombre').order('nombre');
    return error ? [] : data.map(l => l.nombre);
}

export async function addLugar(nombre) {
    if (!nombre) return;
    const clean = nombre.trim();
    if (!clean) return;
    await supabase.from('ahorros_lugares').upsert([{ nombre: clean }], { onConflict: 'nombre' });
}

export async function deleteLugar(nombre) {
    const { error } = await supabase.from('ahorros_lugares').delete().eq('nombre', nombre);
    if (error) throw error;
}

export function buscarClientes(clientes, query) {
    if (!query.trim()) return clientes;
    const q = query.toLowerCase().trim();
    return clientes.filter(c => c.nombre.toLowerCase().includes(q) || (c.puesto && c.puesto.toLowerCase().includes(q)) || (c.lugar && c.lugar.toLowerCase().includes(q)));
}
