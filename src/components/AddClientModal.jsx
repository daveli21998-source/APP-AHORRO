import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { addCliente, getLugares, deleteLugar } from '../db';

export default function AddClientModal({ onClose, onSaved }) {
    const [form, setForm] = useState({
        nombre: '', puesto: '', pasaje: '', lugar: '', tipoAhorro: '', telefono: '',
        montoNormal: '', montoPuesto: '',
        fechaRegistro: new Date().toISOString().split('T')[0]
    });
    const [errors, setErrors] = useState({});
    const [lugares, setLugares] = useState([]);
    const [deleteError, setDeleteError] = useState('');

    useEffect(() => {
        getLugares().then(setLugares);
    }, []);

    async function handleBDelete(lugarItem) {
        if (await deleteLugar(lugarItem)) {
            setLugares(await getLugares());
            if (form.lugar === lugarItem) setForm(f => ({ ...f, lugar: '' }));
        } else {
            setDeleteError(`"${lugarItem}" en uso por clientes.`);
            setTimeout(() => setDeleteError(''), 3500);
        }
    }

    function handleChange(e) {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
        setErrors(err => ({ ...err, [e.target.name]: '' }));
    }

    function selectLugar(val) {
        setForm(f => ({ ...f, lugar: val }));
        setErrors(err => ({ ...err, lugar: '' }));
    }

    function validate() {
        const errs = {};
        if (!form.nombre.trim()) errs.nombre = 'Obligatorio';
        if (!form.puesto.trim()) errs.puesto = 'Obligatorio';
        if (!form.pasaje.trim()) errs.pasaje = 'Obligatorio';
        if (!form.lugar.trim()) errs.lugar = 'Obligatorio';
        if (!form.tipoAhorro) errs.tipoAhorro = 'Selecciona un tipo';
        if (!form.fechaRegistro) errs.fechaRegistro = 'Obligatorio';

        if (['normal', 'ambos'].includes(form.tipoAhorro)) {
            if (!String(form.montoNormal).trim()) errs.montoNormal = 'Ingresa cuota';
        }
        if (['puesto', 'ambos'].includes(form.tipoAhorro)) {
            if (!String(form.montoPuesto).trim()) errs.montoPuesto = 'Ingresa cuota';
        }

        return errs;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }
        const data = {
            nombre: form.nombre.trim(), puesto: form.puesto.trim().toUpperCase(),
            pasaje: form.pasaje.trim(), lugar: form.lugar.trim(),
            tipoAhorro: form.tipoAhorro, telefono: form.telefono.trim(),
            montoNormal: form.montoNormal ? parseFloat(form.montoNormal) : null,
            montoPuesto: form.montoPuesto ? parseFloat(form.montoPuesto) : null,
            fechaRegistro: form.fechaRegistro
        };
        const nuevo = await addCliente(data);
        onSaved(nuevo);
        onClose();
    }

    const inp = (campo) => errors[campo] ? { borderColor: 'var(--danger)' } : {};

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-sheet" role="dialog" aria-modal="true">
                <div className="modal-handle" />

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                    <div className="modal-title" style={{ margin: 0, flex: 1 }}>Nuevo Cliente</div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--surface-3)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>

                    {/* Nombre */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="add-nombre">Nombre completo <Req /></label>
                        <input id="add-nombre" name="nombre" className="form-input"
                            placeholder="Ej: Mario López" value={form.nombre}
                            onChange={handleChange} autoFocus style={inp('nombre')} />
                        {errors.nombre && <Err msg={errors.nombre} />}
                    </div>

                    {/* Puesto + Pasaje */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label" htmlFor="add-puesto">Puesto <Req /></label>
                            <input id="add-puesto" name="puesto" className="form-input"
                                placeholder="Ej: 1" value={form.puesto}
                                onChange={handleChange} style={inp('puesto')} />
                            {errors.puesto && <Err msg={errors.puesto} />}
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="add-pasaje">N° Pasaje <Req /></label>
                            <input id="add-pasaje" name="pasaje" className="form-input"
                                placeholder="Ej: 2" value={form.pasaje}
                                onChange={handleChange} style={inp('pasaje')} />
                            {errors.pasaje && <Err msg={errors.pasaje} />}
                        </div>
                    </div>

                    {/* Lugar — selector inteligente */}
                    <div className="form-group">
                        <label className="form-label">Lugar / Mercado <Req /></label>
                        <LugarSelector
                            value={form.lugar}
                            lugares={lugares}
                            onChange={selectLugar}
                            hasError={!!errors.lugar}
                            onDelete={handleBDelete}
                            deleteError={deleteError}
                        />
                        {errors.lugar && <Err msg={errors.lugar} />}
                    </div>

                    {/* Tipo de Ahorro */}
                    <div className="form-group">
                        <label className="form-label">Tipo de Ahorro <Req /></label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <TipoBtn id="tipo-normal" active={form.tipoAhorro === 'normal'}
                                onClick={() => { setForm(f => ({ ...f, tipoAhorro: 'normal' })); setErrors(e => ({ ...e, tipoAhorro: '' })); }}
                                emoji="💰" label="Normal" color="var(--color-normal)" />
                            <TipoBtn id="tipo-puesto" active={form.tipoAhorro === 'puesto'}
                                onClick={() => { setForm(f => ({ ...f, tipoAhorro: 'puesto' })); setErrors(e => ({ ...e, tipoAhorro: '' })); }}
                                emoji="🏪" label="Puesto" color="var(--color-puesto)" />
                            <TipoBtn id="tipo-ambos" active={form.tipoAhorro === 'ambos'}
                                onClick={() => { setForm(f => ({ ...f, tipoAhorro: 'ambos' })); setErrors(e => ({ ...e, tipoAhorro: '' })); }}
                                emoji="⚖️" label="Ambos" color="var(--info)" />
                        </div>
                        {errors.tipoAhorro && <Err msg={errors.tipoAhorro} />}
                    </div>

                    {/* Cuotas según el tipo seleccionado */}
                    {form.tipoAhorro && (
                        <div className="form-row" style={{ marginTop: 12 }}>
                            {['normal', 'ambos'].includes(form.tipoAhorro) && (
                                <div className="form-group">
                                    <label className="form-label" style={{ color: 'var(--color-normal)' }}>💰 Cuota Normal <Req /></label>
                                    <input name="montoNormal" type="number" step="1" inputMode="decimal"
                                        className="form-input" placeholder="Ej: 50" value={form.montoNormal}
                                        onChange={handleChange} style={inp('montoNormal')} />
                                    {errors.montoNormal && <Err msg={errors.montoNormal} />}
                                </div>
                            )}
                            {['puesto', 'ambos'].includes(form.tipoAhorro) && (
                                <div className="form-group">
                                    <label className="form-label" style={{ color: 'var(--color-puesto)' }}>🏪 Cuota Puesto <Req /></label>
                                    <input name="montoPuesto" type="number" step="1" inputMode="decimal"
                                        className="form-input" placeholder="Ej: 30" value={form.montoPuesto}
                                        onChange={handleChange} style={inp('montoPuesto')} />
                                    {errors.montoPuesto && <Err msg={errors.montoPuesto} />}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Teléfono (opcional) */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="add-tel">
                            Teléfono <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                        </label>
                        <input id="add-tel" name="telefono" className="form-input"
                            placeholder="999 000 000" value={form.telefono}
                            onChange={handleChange} type="tel" />
                    </div>

                    {/* Fecha de Registro */}
                    <div className="form-group">
                        <label className="form-label">
                            📅 Fecha de Registro <Req />
                        </label>
                        <input name="fechaRegistro" className="form-input"
                            type="date" value={form.fechaRegistro}
                            onChange={handleChange} style={inp('fechaRegistro')} />
                        {errors.fechaRegistro && <Err msg={errors.fechaRegistro} />}
                    </div>

                    <div className="btn-row">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-primary" id="btn-confirm-add-client">✅ Guardar Cliente</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Selector inteligente de Lugar ────────────────────────────
function LugarSelector({ value, lugares, onChange, hasError, onDelete, deleteError }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value);
    const [mode, setMode] = useState(lugares.length > 0 ? 'pick' : 'write'); // 'pick' | 'write'
    const ref = useRef(null);

    // Cierra al hacer click fuera
    useEffect(() => {
        function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // Sync query cuando value cambia desde afuera
    useEffect(() => { setQuery(value); }, [value]);

    const filtered = lugares.filter(l => l.toLowerCase().includes(query.toLowerCase()));
    const borderColor = hasError ? 'var(--danger)' : open ? 'var(--primary)' : 'var(--border)';

    // Si no hay lugares registrados → solo modo escritura
    if (lugares.length === 0) {
        return (
            <input className="form-input" placeholder="Ej: Mercado Central"
                value={value} onChange={e => onChange(e.target.value)}
                style={hasError ? { borderColor: 'var(--danger)' } : {}} />
        );
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            {/* Tabs Pick / Nuevo */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <ModeTab active={mode === 'pick'} onClick={() => { setMode('pick'); setQuery(''); onChange(''); setOpen(false); }}>
                    📋 Seleccionar
                </ModeTab>
                <ModeTab active={mode === 'write'} onClick={() => { setMode('write'); setQuery(''); onChange(''); setOpen(false); }}>
                    <Plus size={13} style={{ marginRight: 4 }} /> Nuevo lugar
                </ModeTab>
            </div>

            {mode === 'write' ? (
                // Modo escritura libre
                <input className="form-input" placeholder="Escribe el nuevo lugar..."
                    value={value} onChange={e => onChange(e.target.value)}
                    autoFocus
                    style={hasError ? { borderColor: 'var(--danger)' } : {}} />
            ) : (
                // Modo selector con búsqueda
                <>
                    <div
                        onClick={() => setOpen(o => !o)}
                        style={{
                            background: 'var(--surface-2)', border: `1.5px solid ${borderColor}`,
                            borderRadius: 'var(--radius)', padding: '14px 16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            cursor: 'pointer', transition: 'all 0.18s',
                            boxShadow: open ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
                        }}
                    >
                        <span style={{ color: value ? 'var(--text-1)' : 'var(--text-3)', fontSize: 15, fontWeight: value ? 600 : 400 }}>
                            {value || 'Selecciona un lugar...'}
                        </span>
                        <ChevronDown size={18} style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }} />
                    </div>

                    {open && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                            background: 'var(--surface-3)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)', zIndex: 400, overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'fadeIn 0.12s ease',
                        }}>
                            {/* Buscador dentro del dropdown */}
                            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-2)' }}>
                                <input
                                    className="form-input"
                                    placeholder="Buscar lugar..."
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    style={{ padding: '8px 12px', fontSize: 13 }}
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                />
                            </div>
                            {deleteError && (
                                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: 12, fontWeight: 600, textAlign: 'center', borderBottom: '1px solid var(--border-2)' }}>
                                    ⚠️ {deleteError}
                                </div>
                            )}
                            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {filtered.length === 0 ? (
                                    <div style={{ padding: '16px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                                        Sin resultados
                                    </div>
                                ) : (
                                    filtered.map(lugar => (
                                        <div
                                            key={lugar}
                                            onClick={() => { onChange(lugar); setQuery(lugar); setOpen(false); }}
                                            style={{
                                                padding: '13px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                                color: value === lugar ? 'var(--primary)' : 'var(--text-1)',
                                                background: value === lugar ? 'var(--primary-soft)' : 'transparent',
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                transition: 'background 0.12s',
                                            }}
                                            onMouseEnter={e => { if (value !== lugar) e.currentTarget.style.background = 'var(--surface-2)'; }}
                                            onMouseLeave={e => { if (value !== lugar) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <span>📍</span> <span style={{ flex: 1 }}>{lugar}</span>
                                            {value === lugar && <span style={{ marginLeft: 'auto', fontSize: 16 }}>✓</span>}
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); onDelete(lugar); }}
                                                style={{
                                                    marginLeft: value === lugar ? 8 : 'auto',
                                                    background: 'none', border: 'none', color: 'var(--danger)',
                                                    cursor: 'pointer', padding: '4px', display: 'flex'
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────
function Req() {
    return <span style={{ color: 'var(--danger)' }}>*</span>;
}
function Err({ msg }) {
    return <div style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 600, marginTop: 4 }}>⚠️ {msg}</div>;
}
function TipoBtn({ id, active, onClick, emoji, label, color }) {
    let softColor = color;
    let glowColor = color;
    if (color === 'var(--color-normal)') { softColor = 'var(--color-normal-soft)'; glowColor = 'var(--color-normal-glow)'; }
    if (color === 'var(--color-puesto)') { softColor = 'var(--color-puesto-soft)'; glowColor = 'var(--color-puesto-glow)'; }
    if (color === 'var(--info)') { softColor = 'rgba(59,130,246,0.12)'; glowColor = 'rgba(59,130,246,0.2)'; }

    return (
        <button type="button" id={id} onClick={onClick} style={{
            flex: 1, padding: '12px 6px', borderRadius: 'var(--radius)',
            border: `2px solid ${active ? color : 'var(--border)'}`,
            background: active ? softColor : 'var(--surface-2)',
            color: active ? color : 'var(--text-3)', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s',
            textAlign: 'center', lineHeight: 1.2,
            boxShadow: active ? `0 2px 12px ${glowColor}` : 'none',
        }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
            {label}
        </button>
    );
}
function ModeTab({ active, onClick, children }) {
    return (
        <button type="button" onClick={onClick} style={{
            flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
            border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
            background: active ? 'var(--primary-soft)' : 'var(--surface-2)',
            color: active ? 'var(--primary)' : 'var(--text-3)',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {children}
        </button>
    );
}
