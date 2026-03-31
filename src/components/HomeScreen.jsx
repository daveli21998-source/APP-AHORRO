import { useState, useEffect } from 'react';
import { Plus, Users, TrendingUp, ChevronDown, CheckCircle2, Clock, FileDown } from 'lucide-react';
import SearchBar from './SearchBar';
import { buscarClientes } from '../db';

function getInitials(nombre) {
    return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatMoney(n) {
    return 'S/ ' + n.toFixed(2).replace(/\.00$/, '');
}

export default function HomeScreen({ clientes, onSelectClient, onAddClient, onExport }) {
    const [query, setQuery] = useState('');
    const [filtrados, setFiltrados] = useState(clientes);
    const [activeTab, setActiveTab] = useState('lista'); // 'lista' | 'lugares'
    const [pasajeActivo, setPasajeActivo] = useState({}); // { lugar: pasaje }
    const [lugaresExpandidos, setLugaresExpandidos] = useState({}); // { lugar: boolean }
    const [filtroPago, setFiltroPago] = useState('todos'); // 'todos' | 'pagados' | 'pendientes'

    useEffect(() => {
        const q = query.trim().toLowerCase();
        let result = clientes;

        // Filtro por texto
        if (q) {
            result = result.filter(c =>
                c.nombre.toLowerCase().includes(q) ||
                c.puesto.toLowerCase().includes(q) ||
                (c.lugar && c.lugar.toLowerCase().includes(q)) ||
                (c.pasaje && c.pasaje.toLowerCase().includes(q))
            );
        }

        // Filtro por estado de pago
        if (filtroPago === 'pagados') {
            result = result.filter(c => c.pagadoHoy);
        } else if (filtroPago === 'pendientes') {
            result = result.filter(c => !c.pagadoHoy);
        }

        setFiltrados(result);
    }, [query, clientes, filtroPago]);

    const totalGeneral = clientes.reduce((sum, c) => sum + (c.totalAcumulado || 0), 0);
    const totalClientes = clientes.length;

    return (
        <>
            {/* Header */}
            <div className="topbar">
                <div style={{ flex: 1 }}>
                    <div className="topbar-subtitle">💰 APP AHORROS</div>
                    <div className="topbar-title">Mis Clientes</div>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-bar">
                <div className="stat-chip">
                    <div className="stat-chip-value">{totalClientes}</div>
                    <div className="stat-chip-label">Clientes</div>
                </div>
                <div className="stat-chip" style={{ flex: 2, background: 'var(--primary-soft)', borderColor: 'var(--primary)' }}>
                    <div className="stat-chip-value" style={{ fontSize: 20 }}>{formatMoney(totalGeneral)}</div>
                    <div className="stat-chip-label">Total acumulado</div>
                </div>
            </div>

            {/* Búsqueda */}
            <SearchBar value={query} onChange={setQuery} />

            {/* Filtros de Pago */}
            <div className="filter-container">
                <button 
                    className={`filter-chip ${filtroPago === 'pagados' ? 'active-paid' : ''}`}
                    onClick={() => setFiltroPago(p => p === 'pagados' ? 'todos' : 'pagados')}
                >
                    <CheckCircle2 size={18} color={filtroPago === 'pagados' ? 'var(--color-paid)' : 'var(--text-3)'} />
                    PAGADOS
                </button>
                <button 
                    className={`filter-chip ${filtroPago === 'pendientes' ? 'active-pending' : ''}`}
                    onClick={() => setFiltroPago(p => p === 'pendientes' ? 'todos' : 'pendientes')}
                >
                    <Clock size={18} color={filtroPago === 'pendientes' ? 'var(--color-pending)' : 'var(--text-3)'} />
                    FALTAN PAGAR
                </button>
            </div>

            {/* Opciones de Vista */}
            <div style={{ display: 'flex', gap: 10, padding: '0 16px', marginBottom: 12 }}>
                <button
                    style={{ flex: 1, padding: '10px', borderRadius: 12, background: activeTab === 'lista' ? 'var(--primary-soft)' : 'var(--surface-2)', border: `2px solid ${activeTab === 'lista' ? 'var(--primary)' : 'transparent'}`, color: activeTab === 'lista' ? 'var(--primary)' : 'var(--text-2)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => setActiveTab('lista')}
                >
                    📝 GENERAL
                </button>
                <button
                    style={{ flex: 1, padding: '10px', borderRadius: 12, background: activeTab === 'lugares' ? 'rgba(59,130,246,0.12)' : 'var(--surface-2)', border: `2px solid ${activeTab === 'lugares' ? '#60a5fa' : 'transparent'}`, color: activeTab === 'lugares' ? '#60a5fa' : 'var(--text-2)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => setActiveTab('lugares')}
                >
                    🗺️ LUGARES
                </button>
            </div>

            {/* Lista */}
            <div className="client-list">
                {filtrados.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">
                            {query ? '🔍' : '👥'}
                        </div>
                        <div className="empty-title">
                            {query ? 'Sin resultados' : 'Sin clientes aún'}
                        </div>
                        <div className="empty-desc">
                            {query
                                ? `No se encontró "${query}"`
                                : 'Toca el botón + para agregar tu primer cliente'}
                        </div>
                    </div>
                ) : activeTab === 'lista' ? (
                    filtrados.map(cliente => {
                        const pagado = cliente.pagadoHoy;
                        return (
                            <button
                                key={cliente.id}
                                id={`client-${cliente.id}`}
                                className={`client-card ${pagado ? 'status-paid' : 'status-pending'}`}
                                onClick={() => onSelectClient(cliente)}
                                style={{ width: '100%', textAlign: 'left', font: 'inherit' }}
                            >
                                <div className={`client-avatar ${pagado ? 'status-paid' : 'status-pending'}`}>
                                    {getInitials(cliente.nombre)}
                                </div>
                                <div className="client-info">
                                    <div className="client-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {cliente.nombre}
                                        {pagado ? (
                                            <CheckCircle2 size={16} color="var(--color-paid)" />
                                        ) : (
                                            <Clock size={16} color="var(--color-pending)" />
                                        )}
                                    </div>
                                    <div className="client-meta">
                                        {cliente.puesto && (
                                            <span className="puesto-badge">📍 {cliente.puesto}</span>
                                        )}
                                        {cliente.pasaje && (
                                            <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '4px 10px', fontSize: 13.5, fontWeight: 800 }}>
                                                🚪 Pasaje {cliente.pasaje}
                                            </span>
                                        )}
                                        <span style={{
                                            background: cliente.tipoAhorro === 'ambos' ? 'var(--info-soft)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto-soft)' : 'var(--color-normal-soft)'),
                                            color: cliente.tipoAhorro === 'ambos' ? 'var(--info)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto)' : 'var(--color-normal)'),
                                            border: `1px solid ${cliente.tipoAhorro === 'ambos' ? 'rgba(59,130,246,0.2)' : (cliente.tipoAhorro === 'puesto' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)')}`,
                                            borderRadius: 8, padding: '4px 10px', fontSize: 13.5, fontWeight: 800
                                        }}>
                                            {cliente.tipoAhorro === 'ambos' ? '⚖️ AHORRO COMPLETO' : (cliente.tipoAhorro === 'puesto' ? '🏪 AHORRO PUESTO' : '💰 AHORRO NORMAL')}
                                        </span>
                                    </div>
                                    {cliente.lugar && (
                                        <div style={{ color: 'var(--text-1)', fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                            🗺️ {cliente.lugar}
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })
                ) : (
                    // VISTA: POR LUGARES
                    (() => {
                        const agrupado = filtrados.reduce((acc, c) => {
                            const l = c.lugar || 'Sin Lugar';
                            const p = c.pasaje || 'Sin Pasaje';
                            if (!acc[l]) acc[l] = {};
                            if (!acc[l][p]) acc[l][p] = [];
                            acc[l][p].push(c);
                            return acc;
                        }, {});

                        const lugaresOrdenados = Object.keys(agrupado).sort();

                        return lugaresOrdenados.map(lugar => {
                            const pasajes = Object.keys(agrupado[lugar]).sort();
                            const pActual = pasajeActivo[lugar] || pasajes[0] || 'Sin Pasaje';

                            return (
                                <div key={lugar} id={`lugar-${lugar}`} style={{ marginBottom: 32 }}>
                                    <div 
                                        onClick={() => setLugaresExpandidos(prev => ({ ...prev, [lugar]: !prev[lugar] }))}
                                        style={{ 
                                            cursor: 'pointer', fontSize: 17, fontWeight: 800, color: 'var(--text-1)', 
                                            marginBottom: lugaresExpandidos[lugar] ? 12 : 0, 
                                            paddingBottom: 8, borderBottom: '1px solid var(--surface-3)', 
                                            textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', 
                                            alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' 
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            🗺️ {lugar}
                                            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onExport(lugar, 'normal'); }}
                                                    className="btn-export-tipo normal"
                                                    title="Exportar Ahorro Normal"
                                                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--color-normal)', padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    💰 NORMAL
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onExport(lugar, 'puesto'); }}
                                                    className="btn-export-tipo puesto"
                                                    title="Exportar Ahorro Puesto"
                                                    style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--color-puesto)', padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    🏪 PUESTO
                                                </button>
                                            </div>
                                        </div>
                                        <ChevronDown 
                                            size={20} 
                                            style={{ 
                                                color: 'var(--text-3)', padding: 2, borderRadius: 6, background: 'var(--surface-3)',
                                                transform: lugaresExpandidos[lugar] ? 'rotate(180deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }} 
                                        />
                                    </div>

                                    <div style={{ display: lugaresExpandidos[lugar] ? 'block' : 'none', animation: 'fadeIn 0.2s ease-out' }}>
                                    {pasajes.length > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, overflowX: 'auto', paddingBottom: 6 }}>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-3)' }}>PASAJE:</span>
                                            {pasajes.map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setPasajeActivo(prev => ({ ...prev, [lugar]: p }))}
                                                    style={{
                                                        padding: '7px 18px', borderRadius: 20, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap',
                                                        background: pActual === p ? 'var(--primary)' : 'var(--surface-3)',
                                                        color: pActual === p ? '#fff' : 'var(--text-2)',
                                                        border: `2px solid ${pActual === p ? 'var(--primary)' : 'transparent'}`,
                                                        cursor: 'pointer', transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <h4 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                                            🚪 Pasaje {pActual}
                                        </h4>
                                    </div>

                                    {agrupado[lugar][pActual] && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {agrupado[lugar][pActual].map(cliente => {
                                                const pagado = cliente.pagadoHoy;
                                                return (
                                                    <button
                                                        key={cliente.id}
                                                        className={`client-card ${pagado ? 'status-paid' : 'status-pending'}`}
                                                        onClick={() => onSelectClient(cliente)}
                                                        style={{ width: '100%', textAlign: 'left', font: 'inherit' }}
                                                    >
                                                        <div className={`client-avatar ${pagado ? 'status-paid' : 'status-pending'}`}>{getInitials(cliente.nombre)}</div>
                                                        <div className="client-info">
                                                            <div className="client-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                {cliente.nombre}
                                                                {pagado ? (
                                                                    <CheckCircle2 size={16} color="var(--color-paid)" />
                                                                ) : (
                                                                    <Clock size={16} color="var(--color-pending)" />
                                                                )}
                                                            </div>
                                                            <div className="client-meta">
                                                                {cliente.puesto && <span className="puesto-badge">📍 {cliente.puesto}</span>}
                                                                <span style={{
                                                                    background: cliente.tipoAhorro === 'ambos' ? 'var(--info-soft)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto-soft)' : 'var(--color-normal-soft)'),
                                                                    color: cliente.tipoAhorro === 'ambos' ? 'var(--info)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto)' : 'var(--color-normal)'),
                                                                    border: `1px solid ${cliente.tipoAhorro === 'ambos' ? 'rgba(59,130,246,0.2)' : (cliente.tipoAhorro === 'puesto' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)')}`,
                                                                    borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 800
                                                                }}>
                                                                    {cliente.tipoAhorro === 'ambos' ? '⚖️ COMPLETO' : (cliente.tipoAhorro === 'puesto' ? '🏪 PUESTO' : '💰 NORMAL')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    </div>
                                </div>
                            );
                        });
                    })()
                )}
            </div>

            {/* FAB */}
            <button
                id="btn-add-client"
                className="fab"
                onClick={onAddClient}
                aria-label="Agregar cliente"
            >
                <Plus size={28} />
            </button>
        </>
    );
}
