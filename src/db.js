import { supabase } from './lib/supabase';

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
        fechaRegistro: c.fecha_register || c.fecha_registro, // Soporte ambos por si acaso
        montoNormal: c.monto_normal,
        montoPuesto: c.monto_puesto,
    };
}

export async function getClientesConMetaData() {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Obtener clientes
    const { data: clientes, error: errC } = await supabase
        .from('ahorros_clientes')
        .select('*')
        .order('nombre');
    if (errC) throw errC;

    // 2. Obtener pagos de hoy para todos
    const { data: pagosHoy, error: errP } = await supabase
        .from('ahorros_pagos')
        .select('cliente_id')
        .eq('fecha', today);
    if (errP) throw errP;

    // 3. Obtener totales acumulados por cliente
    // Nota: Podríamos hacer un sum() agrupado, pero para simplicidad y dado que es un disco duro local/desarrollo:
    const { data: todosLosPagos, error: errT } = await supabase
        .from('ahorros_pagos')
        .select('cliente_id, monto');
    if (errT) throw errT;

    const pagosHoySet = new Set(pagosHoy.map(p => p.cliente_id));
    const totalesMap = todosLosPagos.reduce((acc, p) => {
        acc[p.cliente_id] = (acc[p.cliente_id] || 0) + Number(p.monto);
        return acc;
    }, {});

    return clientes.map(c => ({
        ...mapCliente(c),
        pagadoHoy: pagosHoySet.has(c.id),
        totalAcumulado: totalesMap[c.id] || 0
    }));
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

    const { data: insertedData, error } = await supabase
        .from('ahorros_clientes')
        .insert([nuevo])
        .select()
        .single();

    if (error) throw error;
    
    // Si tiene lugar, se guardará automáticamente por el trigger/lógica de la app
    // Pero aquí podemos llamar a addLugar si queremos mantener la tabla de lugares sincronizada
    if (nuevo.lugar) await addLugar(nuevo.lugar);
    
    return insertedData;
}

export async function updateCliente(id, data) {
    const updates = { ...data };
    // Mapear camelCase a snake_case si es necesario
    if (updates.tipoAhorro) {
        updates.tipo_ahorro = updates.tipoAhorro;
        delete updates.tipoAhorro;
    }
    if (updates.fechaRegistro) {
        updates.fecha_registro = updates.fechaRegistro;
        delete updates.fechaRegistro;
    }
    if (updates.montoNormal !== undefined) {
        updates.monto_normal = updates.montoNormal;
        delete updates.montoNormal;
    }
    if (updates.montoPuesto !== undefined) {
        updates.monto_puesto = updates.montoPuesto;
        delete updates.montoPuesto;
    }

    const { data: updatedData, error } = await supabase
        .from('ahorros_clientes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    if (updates.lugar) await addLugar(updates.lugar);
    return updatedData;
}

export async function deleteCliente(id) {
    const { error } = await supabase
        .from('ahorros_clientes')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ─── PAGOS ───────────────────────────────────────────────────
export async function getPagos() {
    const { data, error } = await supabase
        .from('ahorros_pagos')
        .select('*')
        .order('fecha', { ascending: false });
    if (error) {
        console.error('Error fetching pagos:', error);
        return [];
    }
    return data;
}

export async function getPagosByCliente(clienteId) {
    const { data, error } = await supabase
        .from('ahorros_pagos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false });
    if (error) {
        console.error('Error fetching pagos for cliente:', error);
        return [];
    }
    return data;
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

    const { data: insertedData, error } = await supabase
        .from('ahorros_pagos')
        .insert([nuevo])
        .select()
        .single();

    if (error) throw error;
    return insertedData;
}

export async function deletePago(id) {
    const { error } = await supabase
        .from('ahorros_pagos')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ─── TOTALES ─────────────────────────────────────────────────
// NOTA: Estas funciones ahora son async, lo que requiere cambios en los componentes
export async function getTotalesByCliente(clienteId) {
    const { data: pagos, error } = await supabase
        .from('ahorros_pagos')
        .select('tipo, monto')
        .eq('cliente_id', clienteId);

    if (error) return { normal: 0, puesto: 0, total: 0 };

    const normal = pagos
        .filter(p => p.tipo === 'normal')
        .reduce((sum, p) => sum + Number(p.monto), 0);
    const puesto = pagos
        .filter(p => p.tipo === 'puesto')
        .reduce((sum, p) => sum + Number(p.monto), 0);
    
    return { normal, puesto, total: normal + puesto };
}

export async function haPagadoHoy(clienteId) {
    const today = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
        .from('ahorros_pagos')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('fecha', today);
    
    if (error) return false;
    return count > 0;
}

// ─── LUGARES ─────────────────────────────────────────────────
export async function getLugares() {
    const { data, error } = await supabase
        .from('ahorros_lugares')
        .select('nombre')
        .order('nombre');
    if (error) return [];
    return data.map(l => l.nombre);
}

export async function addLugar(nombre) {
    if (!nombre) return;
    const clean = nombre.trim();
    if (!clean) return;

    const { error } = await supabase
        .from('ahorros_lugares')
        .upsert([{ nombre: clean }], { onConflict: 'nombre' });
    
    if (error) console.error('Error adding lugar:', error);
}

// ─── BUSQUEDA ────────────────────────────────────────────────
export function buscarClientes(clientes, query) {
    if (!query.trim()) return clientes;
    const q = query.toLowerCase().trim();
    return clientes.filter(c => 
        c.nombre.toLowerCase().includes(q) || 
        (c.puesto && c.puesto.toLowerCase().includes(q)) ||
        (c.lugar && c.lugar.toLowerCase().includes(q))
    );
}

export async function deleteLugar(nombre) {
    // Verificar si está en uso
    const { count, error: checkError } = await supabase
        .from('ahorros_clientes')
        .select('*', { count: 'exact', head: true })
        .eq('lugar', nombre);
    
    if (checkError || count > 0) return false;

    const { error } = await supabase
        .from('ahorros_lugares')
        .delete()
        .eq('nombre', nombre);
    
    return !error;
}
