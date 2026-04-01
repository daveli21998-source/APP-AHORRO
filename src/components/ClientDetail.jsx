import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, MoreVertical, Trash2, Edit2, Phone, ChevronDown } from 'lucide-react';
import {
    getPagosByCliente, addPago, deletePago,
    getTotalesByCliente, deleteCliente
} from '../db';
import ClientCalendar from './ClientCalendar';
import SelectionCalendar from './SelectionCalendar';

const QUICK_AMOUNTS = [10, 20, 50, 100];

function formatMoney(n) {
    return 'S/ ' + n.toFixed(2).replace(/\.00$/, '');
}

function formatFecha(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
}

function getLocalIsoDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

export default function ClientDetail({ cliente, onBack, onDelete, onEdit, showToast }) {
    const [pagos, setPagos] = useState([]);
    const [totales, setTotales] = useState({ normal: 0, puesto: 0, total: 0 });
    const [tipo, setTipo] = useState(cliente.tipoAhorro === 'puesto' ? 'puesto' : 'normal');
    const [monto, setMonto] = useState('');
    const [selectedQuick, setSelectedQuick] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [activeTab, setActiveTab] = useState('historial'); // 'historial' | 'calendario'
    const [selectedDates, setSelectedDates] = useState(new Set());
    const [showSelectionCalendar, setShowSelectionCalendar] = useState(false);
    const [historialPage, setHistorialPage] = useState(1);

    const reload = useCallback(async () => {
        setPagos(await getPagosByCliente(cliente.id));
        setTotales(await getTotalesByCliente(cliente.id));
    }, [cliente.id]);

    useEffect(() => { reload(); }, [reload]);

    // Cálculo automático de días faltantes
    useEffect(() => {
        if (!cliente.fechaRegistro) return;
        const hoy = getLocalIsoDate();
        const paidDates = new Set(pagos.filter(p => p.tipo === tipo).map(p => p.fecha));

        let start = new Date(cliente.fechaRegistro + 'T12:00:00');
        let end = new Date(hoy + 'T12:00:00');
        let count = 0;
        let curr = new Date(start);
        let lastMissing = hoy;

        while (curr <= end) {
            const f = curr.toISOString().split('T')[0];
            if (!paidDates.has(f)) {
                count++;
                lastMissing = f;
            }
            curr.setDate(curr.getDate() + 1);
        }

        // No pre-seleccionar automáticamente (a petición del usuario)
        setSelectedDates(new Set());
    }, [cliente.fechaRegistro, pagos, tipo]);

    function toggleDate(dateStr) {
        setSelectedDates(prev => {
            const next = new Set(prev);
            if (next.has(dateStr)) next.delete(dateStr);
            else next.add(dateStr);
            return next;
        });
    }

    function handleQuick(amount) {
        setSelectedQuick(amount);
        setMonto(String(amount));
    }

    function handleCustomChange(e) {
        setMonto(e.target.value);
        setSelectedQuick(null);
    }

    async function handleSave() {
        const montoNum = parseFloat(monto);
        if (!monto || isNaN(montoNum) || montoNum <= 0) return;

        let datesToSave = Array.from(selectedDates).sort();
        if (datesToSave.length === 0) {
            const paidDates = new Set(pagos.filter(p => p.tipo === tipo).map(p => p.fecha));
            let current = new Date(getLocalIsoDate() + 'T12:00:00');
            
            while (true) {
                const f = current.toISOString().split('T')[0];
                if (!paidDates.has(f)) {
                    datesToSave = [f];
                    break;
                }
                current.setDate(current.getDate() + 1);
            }
        }

        setSaving(true);
        setTimeout(async () => {
            let savedCount = 0;

            for (const fechaPersonalizada of datesToSave) {
                await addPago({ clienteId: cliente.id, tipo, monto: montoNum, fechaPersonalizada });
                savedCount++;
            }

            await reload();
            setMonto('');
            setSelectedQuick(null);
            setSaving(false);

            showToast(`${savedCount} pago${savedCount > 1 ? 's' : ''} de ${formatMoney(montoNum)} guardado ✓`, '💚');
            setSelectedDates(new Set());
        }, 80);
    }

    async function handleDelPago(id) {
        await deletePago(id);
        reload();
        showToast('Pago eliminado', '🗑️');
    }

    async function handleDeleteCliente() {
        // En vez de window.confirm() bloqueado, se maneja el estado en el menú.
        await deleteCliente(cliente.id);
        onDelete(cliente.id);
    }

    const montoValido = monto && !isNaN(parseFloat(monto)) && parseFloat(monto) > 0;

    return (
        <div className="detail-screen page-enter">
            {/* TopBar */}
            <div className="topbar" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
                <button className="btn-back" onClick={onBack} id="btn-back">
                    <ArrowLeft size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <div className="topbar-title">{cliente.nombre}</div>
                    <div className="topbar-subtitle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {cliente.puesto && <span>📍 {cliente.puesto}</span>}
                        {cliente.pasaje && <span>🚪 Pasaje {cliente.pasaje}</span>}
                        {cliente.tipoAhorro && (
                            <span style={{ 
                                color: cliente.tipoAhorro === 'ambos' ? 'var(--info)' : (cliente.tipoAhorro === 'puesto' ? 'var(--color-puesto)' : 'var(--primary)'),
                                fontWeight: 800,
                                fontSize: '10.5px'
                            }}>
                                {cliente.tipoAhorro === 'ambos' ? '⚖️ COMPLETO' : (cliente.tipoAhorro === 'puesto' ? '🏪 PUESTO' : '💰 NORMAL')}
                            </span>
                        )}
                        {cliente.lugar && <span style={{ color: 'var(--text-3)', fontSize: '10.5px' }}>• {cliente.lugar}</span>}
                    </div>
                </div>
                <div style={{ position: 'relative' }}>
                    <button
                        className="btn-back"
                        onClick={() => setShowMenu(m => !m)}
                        id="btn-menu-options"
                    >
                        <MoreVertical size={18} />
                    </button>
                    {showMenu && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 299 }}
                                onClick={() => setShowMenu(false)}
                            />
                            <div className="options-menu">
                                {cliente.telefono && (
                                    <a
                                        href={`tel:${cliente.telefono}`}
                                        className="options-item"
                                        onClick={() => setShowMenu(false)}
                                    >
                                        <Phone size={15} /> Llamar
                                    </a>
                                )}
                                <div className="options-item" onClick={() => { setShowMenu(false); onEdit(cliente); }}>
                                    <Edit2 size={15} /> Editar
                                </div>
                                <div
                                    className="options-item danger"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowMenu(false);
                                        setShowConfirmModal(true);
                                    }}
                                >
                                    <Trash2 size={15} />
                                    Eliminar cliente
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Totales */}
            <div className="detail-header">
                <div className="detail-totals">
                    <div className="total-card" style={{ borderLeft: '4px solid var(--color-normal)' }}>
                        <div className="total-card-amount" style={{ color: 'var(--color-normal)' }}>{formatMoney(totales.normal)}</div>
                        <div className="total-card-label">Normal</div>
                    </div>
                    <div className="total-card" style={{ borderLeft: '4px solid var(--color-puesto)' }}>
                        <div className="total-card-amount" style={{ color: 'var(--color-puesto)' }}>{formatMoney(totales.puesto)}</div>
                        <div className="total-card-label">Puesto</div>
                    </div>
                    <div className="total-card highlight" style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary)' }}>
                        <div className="total-card-amount" style={{ fontSize: 22, color: 'var(--primary)' }}>{formatMoney(totales.total)}</div>
                        <div className="total-card-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>TOTAL</div>
                    </div>
                </div>
            </div>

            {/* Registro rápido */}
            <div className="quickpay-section">
                <div className="section-title">⚡ Registrar pago</div>

                {/* Toggle Tipo */}
                <div className="tipo-toggle" style={{ display: 'flex', gap: 4 }}>
                    {cliente.tipoAhorro !== 'puesto' && (
                        <button
                            id="tipo-normal"
                            className={`tipo-btn ${tipo === 'normal' ? 'active' : ''}`}
                            onClick={() => {
                                if (tipo !== 'normal') {
                                    setTipo('normal');
                                    setMonto('');
                                    setSelectedQuick(null);
                                    setSelectedDates(new Set());
                                    setHistorialPage(1);
                                }
                            }}
                            style={{
                                flex: 1,
                                ...(tipo === 'normal' ? { background: 'var(--color-normal)', boxShadow: '0 2px 10px var(--color-normal-glow)' } : {})
                            }}
                        >
                            💰 Ahorro Normal
                        </button>
                    )}
                    {cliente.tipoAhorro !== 'normal' && (
                        <button
                            id="tipo-puesto"
                            className={`tipo-btn ${tipo === 'puesto' ? 'active' : ''}`}
                            onClick={() => {
                                if (tipo !== 'puesto') {
                                    setTipo('puesto');
                                    setMonto('');
                                    setSelectedQuick(null);
                                    setSelectedDates(new Set());
                                    setHistorialPage(1);
                                }
                            }}
                            style={{
                                flex: 1,
                                ...(tipo === 'puesto' ? { background: 'var(--color-puesto)', boxShadow: '0 2px 10px var(--color-puesto-glow)' } : {})
                            }}
                        >
                            🏪 Ahorro Puesto
                        </button>
                    )}
                </div>

                {/* Botones rápidos */}
                {(() => {
                    const suggested = tipo === 'normal' ? cliente.montoNormal : cliente.montoPuesto;
                    if (suggested) {
                        return (
                            <div className="quick-amounts" style={{ display: 'flex' }}>
                                <button
                                    id={`quick-${suggested}`}
                                    className={`quick-btn ${selectedQuick === suggested ? 'selected' : ''}`}
                                    style={{
                                        flex: 1, fontSize: 22, padding: '18px',
                                        background: selectedQuick === suggested ? `var(--color-${tipo}-soft)` : 'var(--surface-2)',
                                        border: `2px solid ${selectedQuick === suggested ? `var(--color-${tipo})` : 'var(--border)'}`,
                                        color: selectedQuick === suggested ? `var(--color-${tipo})` : 'var(--text-1)'
                                    }}
                                    onClick={() => handleQuick(suggested)}
                                >
                                    💰 + {suggested} SOLES
                                </button>
                            </div>
                        );
                    }
                    return (
                        <div className="quick-amounts">
                            {QUICK_AMOUNTS.map(amt => (
                                <button
                                    key={amt}
                                    id={`quick-${amt}`}
                                    className={`quick-btn ${selectedQuick === amt ? 'selected' : ''}`}
                                    onClick={() => handleQuick(amt)}
                                >
                                    +{amt}
                                </button>
                            ))}
                        </div>
                    );
                })()}

                {/* Calendario de Selección de Pago */}
                <div style={{ marginTop: 16, marginBottom: 16 }}>
                    <label
                        onClick={() => setShowSelectionCalendar(!showSelectionCalendar)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                            marginBottom: 8, textTransform: 'uppercase', cursor: 'pointer',
                            userSelect: 'none'
                        }}
                    >
                        <span>📅 Seleccionar días a pagar</span>
                        <ChevronDown
                            size={14}
                            style={{
                                transform: showSelectionCalendar ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s',
                                color: showSelectionCalendar ? 'var(--primary)' : 'inherit'
                            }}
                        />
                    </label>

                    {showSelectionCalendar && (
                        <SelectionCalendar
                            selectedDates={selectedDates}
                            onToggleDate={toggleDate}
                            pagos={pagos}
                            tipo={tipo}
                            fechaRegistro={cliente.fechaRegistro}
                        />
                    )}
                </div>

                {/* Monto personalizado */}
                <div className="custom-amount-row">
                    <input
                        id="input-monto"
                        className="custom-amount-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="Otro monto..."
                        value={monto}
                        onChange={handleCustomChange}
                        onKeyDown={e => e.key === 'Enter' && montoValido && handleSave()}
                    />
                </div>

                {/* Botón guardar */}
                <button
                    id="btn-save-payment"
                    className="btn-save"
                    onClick={handleSave}
                    disabled={!montoValido || saving}
                    style={{
                        background: saving ? 'var(--surface-3)' : `linear-gradient(135deg, var(--color-${tipo}) 0%, var(--color-${tipo}) 100%)`,
                        boxShadow: montoValido && !saving ? `0 4px 20px var(--color-${tipo}-glow)` : 'none'
                    }}
                >
                    {saving ? '⏳ Guardando...' : `💾 Guardar ${monto ? formatMoney(parseFloat(monto) || 0) : ''}`}
                </button>
            </div>

            {/* Pestañas de Historial y Calendario */}
            <div className="historial-section">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button
                        style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: activeTab === 'historial' ? 'var(--surface-3)' : 'transparent', border: activeTab === 'historial' ? '1px solid var(--border)' : '1px solid transparent', color: activeTab === 'historial' ? 'var(--text-1)' : 'var(--text-3)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                        onClick={() => setActiveTab('historial')}
                    >
                        🕐 Historial ({pagos.filter(p => p.tipo === tipo).length})
                    </button>
                    <button
                        style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: activeTab === 'calendario' ? 'var(--surface-3)' : 'transparent', border: activeTab === 'calendario' ? '1px solid var(--border)' : '1px solid transparent', color: activeTab === 'calendario' ? 'var(--text-1)' : 'var(--text-3)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                        onClick={() => setActiveTab('calendario')}
                    >
                        📅 Cronograma de Pago
                    </button>
                </div>

                {activeTab === 'historial' ? (
                    (() => {
                        const filteredPagos = pagos.filter(p => p.tipo === tipo);
                        if (filteredPagos.length === 0) {
                            return (
                                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)', fontSize: 14 }}>
                                    Sin pagos tipo {tipo === 'normal' ? 'Normal' : 'Puesto'} — registra uno arriba
                                </div>
                            );
                        }
                        const ITEMS_PER_PAGE = 10;
                        const totalPages = Math.ceil(filteredPagos.length / ITEMS_PER_PAGE);
                        const paginatedPagos = filteredPagos.slice((historialPage - 1) * ITEMS_PER_PAGE, historialPage * ITEMS_PER_PAGE);

                        const handlePageNav = (newPage, shouldScroll) => {
                            setHistorialPage(newPage);
                            if (shouldScroll) {
                                const tabs = document.querySelector('.historial-section');
                                const container = document.querySelector('.detail-screen');
                                if (tabs && container) {
                                    container.scrollTo({ top: tabs.offsetTop - 70, behavior: 'smooth' });
                                }
                            }
                        };

                        const PaginationControls = ({ isBottom }) => (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, margin: '20px 0' }}>
                                <button
                                    onClick={() => handlePageNav(Math.max(1, historialPage - 1), isBottom)}
                                    disabled={historialPage === 1}
                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: historialPage === 1 ? 'not-allowed' : 'pointer', opacity: historialPage === 1 ? 0.5 : 1 }}
                                >
                                    Anterior
                                </button>
                                <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>Página {historialPage} de {totalPages}</span>
                                <button
                                    onClick={() => handlePageNav(Math.min(totalPages, historialPage + 1), isBottom)}
                                    disabled={historialPage === totalPages}
                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: historialPage === totalPages ? 'not-allowed' : 'pointer', opacity: historialPage === totalPages ? 0.5 : 1 }}
                                >
                                    Siguiente
                                </button>
                            </div>
                        );

                        return (
                            <>
                                {totalPages > 1 && <PaginationControls isBottom={false} />}
                                {paginatedPagos.map(pago => (
                                    <div key={pago.id} className="pago-item">
                                        <div className={`pago-dot ${pago.tipo}`} />
                                        <div className="pago-info">
                                            <div className={`pago-tipo ${pago.tipo}`}>
                                                {pago.tipo === 'normal' ? 'Normal' : 'Puesto'}
                                            </div>
                                            <div className="pago-fecha">
                                                {formatFecha(pago.fecha)}
                                                {pago.hora && ` • ${pago.hora}`}
                                            </div>
                                        </div>
                                        <div className="pago-monto">{formatMoney(pago.monto)}</div>
                                        <button
                                            className="btn-del-pago"
                                            onClick={() => handleDelPago(pago.id)}
                                            title="Eliminar pago"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </>
                        );
                    })()
                ) : (
                    <ClientCalendar pagos={pagos} cliente={cliente} activeTipo={tipo} />
                )}
            </div>

            {/* Modal de confirmación de eliminación */}
            {showConfirmModal && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal-sheet">
                        <div className="modal-handle" />
                        <h3 className="modal-title" style={{ marginBottom: 16 }}>¿Eliminar cliente?</h3>
                        <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                            Esta acción borrará al cliente de tu lista y eliminará permanentemente todo su historial de pagos asociados.
                            <br /><br />
                            <strong style={{ color: 'var(--danger)' }}>No podrás deshacer esta acción.</strong>
                        </p>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                style={{ flex: 1, padding: '16px', borderRadius: 'var(--radius)', background: 'var(--surface-3)', border: '1.5px solid var(--border)', color: 'var(--text-1)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
                                onClick={() => setShowConfirmModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                style={{ flex: 1, padding: '16px', borderRadius: 'var(--radius)', background: 'var(--danger)', border: 'none', color: 'white', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 16px rgba(239, 68, 68, 0.2)' }}
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    handleDeleteCliente();
                                }}
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
