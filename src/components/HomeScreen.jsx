import { useState, useEffect } from 'react';
import { Plus, Users, TrendingUp, ChevronDown, CheckCircle2, Clock, FileDown, DollarSign, Home, BarChart3, Settings, Scale, Store, MapPin, DoorOpen, RefreshCcw } from 'lucide-react';
import SearchBar from './SearchBar';
import { buscarClientes } from '../db';
import RecaudadoModal from './RecaudadoModal';

function getInitials(nombre) {
    return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatMoney(n) {
    return 'S/ ' + n.toFixed(2).replace(/\.00$/, '');
}

export default function HomeScreen({ clientes, onSelectClient, onAddClient, onExport, onSyncClient, onGlobalSync, isGlobalSyncing, pendingCount = 0 }) {

    const [query, setQuery] = useState('');
    const [filtrados, setFiltrados] = useState(clientes);
    const [activeTab, setActiveTab] = useState('lista'); // 'lista' | 'lugares'
    const [pasajeActivo, setPasajeActivo] = useState({}); // { lugar: pasaje }
    const [lugaresExpandidos, setLugaresExpandidos] = useState({}); // { lugar: boolean }
    const [filtroPago, setFiltroPago] = useState('todos'); // 'todos' | 'pagados' | 'pendientes'
    const [currentPage, setCurrentPage] = useState(1);
    const [showRecaudado, setShowRecaudado] = useState(false);
    const [spinningIds, setSpinningIds] = useState({});
    const ITEMS_PER_PAGE = 10;

    const handleQuickSync = (e, cliente) => {
        e.stopPropagation();
        setSpinningIds(prev => ({ ...prev, [cliente.id]: true }));
        onSyncClient(cliente.id);
        setTimeout(() => {
            setSpinningIds(prev => {
                const newState = { ...prev };
                delete newState[cliente.id];
                return newState;
            });
        }, 600);
    };

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
        setCurrentPage(1); // Reset page on filter change
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

            {/* Filtros de Pago y Acciones */}
            <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginBottom: 16, alignItems: 'center' }}>
                <button 
                    onClick={() => setFiltroPago(p => p === 'pagados' ? 'todos' : 'pagados')}
                    style={{
                        background: filtroPago === 'pagados' ? 'rgba(34, 197, 94, 0.15)' : 'var(--surface-2)',
                        border: filtroPago === 'pagados' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid transparent',
                        color: filtroPago === 'pagados' ? '#4ade80' : 'var(--text-3)',
                        padding: '10px 16px',
                        borderRadius: '24px',
                        fontSize: 13,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s',
                        cursor: 'pointer'
                    }}
                >
                    <CheckCircle2 size={16} />
                    PAGADOS
                </button>

                <button 
                    onClick={() => setFiltroPago(p => p === 'pendientes' ? 'todos' : 'pendientes')}
                    style={{
                        background: filtroPago === 'pendientes' ? 'rgba(251, 191, 36, 0.15)' : 'var(--surface-2)',
                        border: filtroPago === 'pendientes' ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid transparent',
                        color: filtroPago === 'pendientes' ? '#fbd38d' : 'var(--text-3)',
                        padding: '10px 16px',
                        borderRadius: '24px',
                        fontSize: 13,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 0.2s',
                        cursor: 'pointer'
                    }}
                >
                    <Clock size={16} />
                    FALTAN
                </button>

                {/* Botón Sincronizar/Actualizar Global */}
                <button
                    onClick={onGlobalSync}
                    disabled={isGlobalSyncing}
                    className="sync-btn-wrapper"
                    style={{
                        background: 'transparent',
                        border: '1px solid rgba(0, 230, 118, 0.3)',
                        color: 'var(--primary)',
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: isGlobalSyncing ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: isGlobalSyncing ? 0.7 : 1,
                        position: 'relative'
                    }}
                >
                    <RefreshCcw size={20} className={isGlobalSyncing ? 'spin-once' : ''} style={{ animationIterationCount: isGlobalSyncing ? 'infinite' : '1' }} />
                    {pendingCount > 0 && (
                        <span className="sync-badge-count">{pendingCount > 99 ? '99+' : pendingCount}</span>
                    )}
                </button>

                {/* Botón $ */}
                <button
                    onClick={() => setShowRecaudado(true)}
                    style={{
                        background: 'var(--surface-2)',
                        border: 'none',
                        color: 'var(--text-3)',
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: 16
                    }}
                >
                    <DollarSign size={20} strokeWidth={2.5} />
                </button>
            </div>

            {/* Opciones de Vista (Segmented Control) */}
            <div className="segmented-control-wrapper">
                <div className="segmented-control">
                    <button
                        className={`segmented-item ${activeTab === 'lista' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lista')}
                    >
                        📝 GENERAL
                    </button>
                    <button
                        className={`segmented-item ${activeTab === 'lugares' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lugares')}
                    >
                        🗺️ LUGARES
                    </button>
                </div>
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
                    <>
                        {filtrados.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(cliente => {
                            const pagado = cliente.pagadoHoy;
                            return (
                                <div
                                    key={cliente.id}
                                    className={`client-card status-${cliente.statusHoy || 'ROJO'}`}
                                    onClick={() => onSelectClient(cliente)}
                                >
                                    <div className={`client-avatar status-${cliente.statusHoy || 'ROJO'}`}>
                                        {getInitials(cliente.nombre)}
                                    </div>
                                    <div className="client-info">
                                        <div className="client-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ display: 'flex', gap: 3 }}>
                                                {cliente.tiposPagadosHoy?.includes('normal') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-normal)', boxShadow: '0 0 5px var(--color-normal-glow)' }} />}
                                                {cliente.tiposPagadosHoy?.includes('puesto') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-puesto)', boxShadow: '0 0 5px var(--color-puesto-glow)' }} />}
                                            </div>
                                            {cliente.nombre}
                                            {pagado && <CheckCircle2 size={16} color="var(--color-paid)" />}
                                        </div>
                                        <div className="client-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', marginTop: 8 }}>
                                            {cliente.puesto && (
                                                <span style={{
                                                    background: '#0f172a', border: '1px solid #1e293b',
                                                    color: '#fbbf24', borderRadius: 8, padding: '4px 10px',
                                                    fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4
                                                }}>
                                                    <MapPin size={12} color="#ef4444" strokeWidth={3} /> PSTO {cliente.puesto}
                                                </span>
                                            )}
                                            
                                            {cliente.pasaje && (
                                                <span style={{
                                                    background: '#0f172a', border: '1px solid #1e293b',
                                                    color: '#fbbf24', borderRadius: 8, padding: '4px 10px',
                                                    fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4
                                                }}>
                                                    <DoorOpen size={12} color="#f59e0b" strokeWidth={3} /> PASAJE {cliente.pasaje}
                                                </span>
                                            )}

                                            <span style={{
                                                background: cliente.tipoAhorro === 'ambos' ? 'var(--color-completo)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto)' : 'var(--color-normal)'),
                                                color: '#ffffff',
                                                border: `1px solid ${cliente.tipoAhorro === 'ambos' ? 'var(--color-completo)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto)' : 'var(--color-normal)')}`,
                                                borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 900,
                                                boxShadow: `0 4px 12px ${cliente.tipoAhorro === 'ambos' ? 'var(--color-completo-glow)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto-glow)' : 'var(--color-normal-glow)')}`,
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                width: 'fit-content'
                                            }}>
                                                {cliente.tipoAhorro === 'ambos' ? <><Scale size={13} strokeWidth={3} /> COMPLETO</> : (cliente.tipoAhorro === 'puesto' ? <><Store size={13} strokeWidth={3} /> PUESTO</> : <><DollarSign size={13} strokeWidth={3} /> NORMAL</>)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Acción rápida móvil: Sincronizar individual */}
                                    <div className="client-card-actions">
                                        <div 
                                            className="btn-card-action" 
                                            onClick={(e) => handleQuickSync(e, cliente)}
                                            style={{ color: 'var(--color-paid)', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}
                                        >
                                            <RefreshCcw 
                                                size={18} 
                                                className={spinningIds[cliente.id] ? 'spin-once' : ''} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Pagination Controls */}
                        {filtrados.length > ITEMS_PER_PAGE && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 16,
                                padding: '20px 0 40px',
                                animation: 'fadeIn 0.3s ease'
                            }}>
                                <button
                                    disabled={currentPage === 1}
                                    onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(1, p - 1)); }}
                                    style={{
                                        background: 'var(--surface-2)',
                                        border: '1px solid var(--border)',
                                        color: currentPage === 1 ? 'var(--text-3)' : 'var(--primary)',
                                        padding: '10px 18px',
                                        borderRadius: '20px',
                                        fontSize: 13,
                                        fontWeight: 800,
                                        cursor: currentPage === 1 ? 'default' : 'pointer',
                                        opacity: currentPage === 1 ? 0.5 : 1,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    ← ANTERIOR
                                </button>
                                
                                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-2)' }}>
                                    {currentPage} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>/</span> {Math.ceil(filtrados.length / ITEMS_PER_PAGE)}
                                </div>

                                <button
                                    disabled={currentPage === Math.ceil(filtrados.length / ITEMS_PER_PAGE)}
                                    onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(Math.ceil(filtrados.length / ITEMS_PER_PAGE), p + 1)); }}
                                    style={{
                                        background: 'var(--surface-2)',
                                        border: '1px solid var(--border)',
                                        color: currentPage === Math.ceil(filtrados.length / ITEMS_PER_PAGE) ? 'var(--text-3)' : 'var(--primary)',
                                        padding: '10px 18px',
                                        borderRadius: '20px',
                                        fontSize: 13,
                                        fontWeight: 800,
                                        cursor: currentPage === Math.ceil(filtrados.length / ITEMS_PER_PAGE) ? 'default' : 'pointer',
                                        opacity: currentPage === Math.ceil(filtrados.length / ITEMS_PER_PAGE) ? 0.5 : 1,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    SIGUIENTE →
                                </button>
                            </div>
                        )}
                    </>
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
                                                        className={`client-card status-${cliente.statusHoy || 'ROJO'}`}
                                                        onClick={() => onSelectClient(cliente)}
                                                        style={{ 
                                                            width: '100%', 
                                                            textAlign: 'left', 
                                                            font: 'inherit',
                                                            background: 'var(--surface)',
                                                            border: '1px solid var(--border-2)',
                                                            borderRadius: '16px',
                                                            padding: '16px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '16px',
                                                            marginBottom: '10px'
                                                        }}
                                                    >
                                                        {/* Avatar */}
                                                        <div className={`client-avatar status-${cliente.statusHoy || 'ROJO'}`} style={{
                                                            width: 52, 
                                                            height: 52, 
                                                            fontSize: 22,
                                                            flexShrink: 0
                                                        }}>
                                                            {getInitials(cliente.nombre)}
                                                        </div>
                                                        
                                                        <div className="client-info" style={{ flex: 1 }}>
                                                            {/* Nombre */}
                                                            <div className="client-name" style={{ fontSize: 17, fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                                <div style={{ display: 'flex', gap: 3 }}>
                                                                    {cliente.tiposPagadosHoy?.includes('normal') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-normal)', boxShadow: '0 0 5px var(--color-normal-glow)' }} />}
                                                                    {cliente.tiposPagadosHoy?.includes('puesto') && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-puesto)', boxShadow: '0 0 5px var(--color-puesto-glow)' }} />}
                                                                </div>
                                                                {cliente.nombre}
                                                                {pagado ? (
                                                                    <CheckCircle2 size={16} color="var(--primary)" />
                                                                ) : (
                                                                    <Clock size={16} color="var(--color-pending)" />
                                                                )}
                                                            </div>
                                                            
                                                            {/* Badges */}
                                                            <div className="client-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px' }}>
                                                                {cliente.puesto && (
                                                                    <span style={{
                                                                        background: '#0f172a', border: '1px solid #1e293b',
                                                                        color: '#fbbf24', borderRadius: 8, padding: '4px 10px',
                                                                        fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4
                                                                    }}>
                                                                    <MapPin size={12} color="#ef4444" strokeWidth={3} /> PSTO {cliente.puesto}
                                                                    </span>
                                                                )}
                                                                
                                                                {cliente.pasaje && (
                                                                    <span style={{
                                                                        background: '#0f172a', border: '1px solid #1e293b',
                                                                        color: '#fbbf24', borderRadius: 8, padding: '4px 10px',
                                                                        fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4
                                                                    }}>
                                                                    <DoorOpen size={12} color="#f59e0b" strokeWidth={3} /> PASAJE {cliente.pasaje}
                                                                    </span>
                                                                )}

                                                                {cliente.tipoAhorro === 'ambos' ? (
                                                                    <span style={{
                                                                        background: 'var(--color-completo)', border: '1px solid var(--color-completo)',
                                                                        color: '#ffffff', borderRadius: 8, padding: '4px 10px',
                                                                        fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4,
                                                                        boxShadow: '0 4px 12px var(--color-completo-glow)'
                                                                    }}>
                                                                        <Scale size={13} strokeWidth={3} /> COMPLETO
                                                                    </span>
                                                                ) : cliente.tipoAhorro === 'puesto' ? (
                                                                    <span style={{
                                                                        background: 'var(--color-puesto)', border: '1px solid var(--color-puesto)',
                                                                        color: '#ffffff', borderRadius: 8, padding: '4px 10px',
                                                                        fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4,
                                                                        boxShadow: '0 4px 12px var(--color-puesto-glow)'
                                                                    }}>
                                                                        <Store size={13} strokeWidth={3} /> PUESTO
                                                                    </span>
                                                                ) : (
                                                                    <span style={{
                                                                        background: 'var(--color-normal)', border: '1px solid var(--color-normal)',
                                                                        color: '#ffffff', borderRadius: 8, padding: '4px 10px',
                                                                        fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4,
                                                                        boxShadow: '0 4px 12px var(--color-normal-glow)'
                                                                    }}>
                                                                        <DollarSign size={13} strokeWidth={3} /> NORMAL
                                                                    </span>
                                                                )}
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

            {/* El Navbar Inferior fue removido de aquí para usar solo el de App.jsx */}


            {showRecaudado && <RecaudadoModal onClose={() => setShowRecaudado(false)} />}
        </>
    );
}
