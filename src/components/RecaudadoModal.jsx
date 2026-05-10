import { useState, useEffect } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight, DollarSign, Scale, Store, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { getAllPagosMerged, getClientesConMetaData } from '../db';

export default function RecaudadoModal({ onClose }) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [allPagos, setAllPagos] = useState([]);
    const [allClientes, setAllClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showTotalNormal, setShowTotalNormal] = useState(false);
    const [showTotalPuesto, setShowTotalPuesto] = useState(false);
    const [showTotalDia, setShowTotalDia] = useState(false);

    useEffect(() => {
        async function loadData() {
            // Bug 6 fix: usar funciones que fusionan datos online + cola offline
            const [p, c] = await Promise.all([getAllPagosMerged(), getClientesConMetaData()]);
            setAllPagos(p);
            setAllClientes(c);
            setLoading(false);
        }
        loadData();
    }, []);

    const pagosDia = allPagos.filter(p => {
        // REGLA DE ORO: Recaudado siempre usa la fecha real de cobro (fecha_pago_real)
        // Para registros antiguos sin este campo, usamos fecha (asumiendo que antes se usaba igual)
        const dReal = p.fecha_pago_real || p.fecha;
        return dReal === selectedDate;
    });
    
    const totalNormal = pagosDia.filter(p => p.tipo === 'normal').reduce((s, p) => s + Number(p.monto), 0);
    const totalPuesto = pagosDia.filter(p => p.tipo === 'puesto').reduce((s, p) => s + Number(p.monto), 0);
    const totalDia = totalNormal + totalPuesto;

    // Agrupar por cliente
    const cobrosPorCliente = pagosDia.reduce((acc, p) => {
        if (!acc[p.cliente_id]) {
            const c = allClientes.find(cli => cli.id === p.cliente_id);
            acc[p.cliente_id] = {
                nombre: c ? c.nombre : 'Cliente Desconocido',
                puesto: c ? c.puesto : '',
                pasaje: c ? c.pasaje : '',
                tipos: new Set(),
                monto: 0
            };
        }
        acc[p.cliente_id].tipos.add(p.tipo);
        acc[p.cliente_id].monto += Number(p.monto);
        return acc;
    }, {});

    function changeDate(days) {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() + days);
        setSelectedDate(d.toISOString().split('T')[0]);
    }

    const formatMoney = (val) => `S/ ${Number(val).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`;

    return (
        <div className="modal-overlay" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}>
            <div className="modal-content" style={{ 
                maxWidth: 500, 
                maxHeight: '90vh', 
                overflowY: 'auto', 
                padding: 0, 
                background: '#051109', 
                border: '1px solid #14532d',
                borderRadius: 24,
                position: 'relative'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#051109', zIndex: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#10b981', fontWeight: 900, fontSize: 18 }}>
                        <DollarSign size={22} strokeWidth={3} /> RECAUDADO
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#0d2d1b', borderRadius: 20, padding: '4px 12px', border: '1px solid #14532d' }}>
                            <button onClick={() => changeDate(-1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 5 }}><ChevronLeft size={20} /></button>
                            <input 
                                type="date" 
                                value={selectedDate} 
                                onChange={(e) => setSelectedDate(e.target.value)}
                                style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, outline: 'none', width: 110, textAlign: 'center' }}
                            />
                            <button onClick={() => changeDate(1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 5 }}><ChevronRight size={20} /></button>
                        </div>
                        <button onClick={onClose} style={{ background: '#1e293b', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#10b981' }}>Cargando datos...</div>
                ) : (
                    <div style={{ padding: '0 24px 24px' }}>
                        {/* Totales Row */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            <div 
                                onClick={() => setShowTotalNormal(!showTotalNormal)}
                                style={{ flex: 1, background: '#0d1a12', borderRadius: 16, padding: '16px', border: '1px solid #14532d', textAlign: 'center', cursor: 'pointer' }}
                            >
                                <div style={{ fontSize: 10, fontWeight: 900, color: '#3b82f6', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                    <DollarSign size={12} strokeWidth={3} /> NORMAL
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    {showTotalNormal ? formatMoney(totalNormal) : 'S/ ****'}
                                    {showTotalNormal ? <EyeOff size={16} style={{ opacity: 0.5 }} /> : <Eye size={16} style={{ opacity: 0.5 }} />}
                                </div>
                            </div>
                            <div 
                                onClick={() => setShowTotalPuesto(!showTotalPuesto)}
                                style={{ flex: 1, background: '#0d1a12', borderRadius: 16, padding: '16px', border: '1px solid #14532d', textAlign: 'center', cursor: 'pointer' }}
                            >
                                <div style={{ fontSize: 10, fontWeight: 900, color: '#f59e0b', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                    <Store size={12} strokeWidth={3} /> PUESTO
                                </div>
                                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    {showTotalPuesto ? formatMoney(totalPuesto) : 'S/ ****'}
                                    {showTotalPuesto ? <EyeOff size={16} style={{ opacity: 0.5 }} /> : <Eye size={16} style={{ opacity: 0.5 }} />}
                                </div>
                            </div>
                        </div>

                        {/* Total Dia */}
                        <div 
                            onClick={() => setShowTotalDia(!showTotalDia)}
                            style={{ 
                                background: '#10b981', 
                                borderRadius: 16, 
                                padding: '16px 24px', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: 24,
                                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)',
                                cursor: 'pointer'
                            }}>
                            <div style={{ color: '#064e3b', fontWeight: 900, fontSize: 14 }}>TOTAL DEL DÍA</div>
                            <div style={{ color: '#fff', fontWeight: 900, fontSize: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {showTotalDia ? formatMoney(totalDia) : 'S/ ****'}
                                {showTotalDia ? <EyeOff size={20} style={{ opacity: 0.7 }} /> : <Eye size={20} style={{ opacity: 0.7 }} />}
                            </div>
                        </div>

                        {/* Detalle */}
                        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 12, fontWeight: 800 }}>
                            📝 DETALLE DE COBROS:
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {Object.keys(cobrosPorCliente).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563', fontSize: 14 }}>
                                    No hay cobros registrados para esta fecha.
                                </div>
                            ) : (
                                Object.entries(cobrosPorCliente).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre)).map(([id, cobro]) => (
                                    <div key={id} style={{ 
                                        background: '#0d2d1b', 
                                        borderRadius: 12, 
                                        padding: '16px', 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        gap: 8,
                                        borderLeft: '4px solid #10b981'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ display: 'flex', gap: 3 }}>
                                                    {cobro.tipos.has('normal') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />}
                                                    {cobro.tipos.has('puesto') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />}
                                                </div>
                                                <div style={{ color: '#e5e7eb', fontWeight: 800, fontSize: 15 }}>
                                                    {cobro.nombre} 
                                                    {cobro.puesto && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 8, opacity: 0.8 }}>📍 {cobro.puesto}</span>}
                                                    {cobro.pasaje && <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 6, opacity: 0.8 }}>🚪 {cobro.pasaje}</span>}
                                                </div>
                                            </div>
                                            <div style={{ color: '#10b981', fontWeight: 900, fontSize: 18 }}>{formatMoney(cobro.monto)}</div>
                                        </div>
                                        
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
