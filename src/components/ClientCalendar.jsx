import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ClientCalendar({ pagos, cliente, activeTipo }) {
    // Fechas usando zona horaria de Perú (Lima)
    const getPeruDate = () => {
        const d = new Date();
        const str = d.toLocaleString("en-US", { timeZone: "America/Lima" });
        return new Date(str);
    };

    const peruDate = getPeruDate();
    const [currentDate, setCurrentDate] = useState(new Date(peruDate.getFullYear(), peruDate.getMonth(), 1));
    const [filter, setFilter] = useState(activeTipo || (cliente.tipoAhorro === 'puesto' ? 'puesto' : 'normal'));

    // Sincronizar filtro si cambia el tipo desde afuera
    useEffect(() => {
        if (activeTipo) setFilter(activeTipo);
    }, [activeTipo]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // 0 = Dom, 1 = Lun ... 6 = Sab => Pasamos a Lunes como 1er día:
    const firstDayIndex = (new Date(year, month, 1).getDay() || 7) - 1;

    // Extraer qué días se pagó en ese mes y año, según filtro
    const paidDays = new Set();
    pagos.forEach(p => {
        if (p.tipo === filter) {
            const [py, pm, pd] = p.fecha.split('-').map(Number);
            if (py === year && pm === month + 1) {
                paidDays.add(pd);
            }
        }
    });

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    return (
        <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius)', marginTop: 8 }}>
            {/* Si tiene ambos ahorros, dejar que escoja el filtro */}
            {cliente.tipoAhorro === 'ambos' && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    <button
                        style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)',
                            background: filter === 'normal' ? 'var(--primary-soft)' : 'var(--surface-3)',
                            border: `2px solid ${filter === 'normal' ? 'var(--primary)' : 'var(--border)'}`,
                            color: filter === 'normal' ? 'var(--primary)' : 'var(--text-3)',
                            fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        onClick={() => setFilter('normal')}
                    >💰 Normal</button>
                    <button
                        style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)',
                            background: filter === 'puesto' ? 'rgba(245,158,11,0.15)' : 'var(--surface-3)',
                            border: `2px solid ${filter === 'puesto' ? 'var(--warning)' : 'var(--border)'}`,
                            color: filter === 'puesto' ? 'var(--warning)' : 'var(--text-3)',
                            fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                        }}
                        onClick={() => setFilter('puesto')}
                    >🏪 Puesto</button>
                </div>
            )}

            {/* Cabecera del Mes */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button
                    onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                    style={{ background: 'var(--surface-3)', border: 'none', color: 'var(--text-1)', cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <ChevronLeft size={18} />
                </button>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {monthNames[month]} {year}
                </div>
                <button
                    onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                    style={{ background: 'var(--surface-3)', border: 'none', color: 'var(--text-1)', cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Días semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 10, fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>
                {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(d => <div key={d}>{d}</div>)}
            </div>

            {/* Grilla calendario */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {Array.from({ length: firstDayIndex }).map((_, i) => <div key={`empty-${i}`} />)}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const [regY, regM, regD] = (cliente.fechaRegistro || '').split('-').map(Number);
                    const isRegistrationDay = regY === year && regM === month + 1 && regD === day;
                    const isPaid = paidDays.has(day);
                    const isToday = day === peruDate.getDate() && month === peruDate.getMonth() && year === peruDate.getFullYear();

                    let bg = 'var(--surface-3)';
                    let color = 'var(--text-1)';
                    let border = '2px solid transparent';
                    let fontWeight = 600;

                    if (isRegistrationDay) {
                        bg = filter === 'normal' ? 'var(--color-normal)' : 'var(--color-puesto)';
                        color = '#fff';
                        border = `2px solid #fff`; // Borde blanco para destacar que es el inicio
                        fontWeight = 900;
                    } else if (isPaid) {
                        bg = filter === 'normal' ? 'var(--color-normal)' : 'var(--color-puesto)';
                        color = '#fff';
                        border = `2px solid ${bg}`;
                        fontWeight = 800;
                    } else if (isToday) {
                        bg = 'transparent';
                        border = '2px solid var(--text-3)';
                        color = 'var(--text-1)';
                        fontWeight = 800;
                    }

                    return (
                        <div key={day} style={{
                            aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: bg, color: color, borderRadius: 10, fontSize: 14, fontWeight: isPaid || isToday ? 800 : 600,
                            border: border, opacity: isPaid || isToday ? 1 : 0.7
                        }}>
                            {day}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, background: 'var(--surface-3)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontWeight: 600 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: filter === 'normal' ? 'var(--color-normal)' : 'var(--color-puesto)', border: '2px solid #fff' }}></span>
                        Inicio
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontWeight: 600 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: filter === 'normal' ? 'var(--color-normal)' : 'var(--color-puesto)' }}></span>
                        Pagado
                    </div>
                </div>
                <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                    {paidDays.size} días pagados en {monthNames[month].toLowerCase()}
                </div>
            </div>
        </div>
    );
}
