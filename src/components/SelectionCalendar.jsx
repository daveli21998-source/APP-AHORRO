import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function SelectionCalendar({ selectedDates, onToggleDate, pagos, tipo, fechaRegistro }) {
    // Usamos Lima, Perú para la fecha "hoy"
    const getPeruDate = () => {
        const d = new Date();
        const str = d.toLocaleString("en-US", { timeZone: "America/Lima" });
        return new Date(str);
    };

    const peruDate = getPeruDate();
    const [viewDate, setViewDate] = useState(new Date(peruDate.getFullYear(), peruDate.getMonth(), 1));

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = (new Date(year, month, 1).getDay() || 7) - 1;

    // Fechas ya pagadas en este mes para oscurecerlas
    const paidDates = new Set(
        pagos.filter(p => p.tipo === tipo).map(p => p.fecha)
    );

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    return (
        <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                    <ChevronLeft size={16} />
                </button>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', textTransform: 'uppercase' }}>
                    {monthNames[month]} {year}
                </div>
                <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                    <ChevronRight size={16} />
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: 6, fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>
                {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d}>{d}</div>)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {Array.from({ length: firstDayIndex }).map((_, i) => <div key={`empty-${i}`} />)}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isPaid = paidDates.has(dateStr);
                    const isRegistrationDay = dateStr === fechaRegistro;
                    const isSelected = selectedDates.has(dateStr);
                    const isToday = dateStr === peruDate.toISOString().split('T')[0];
                    const isBeforeRegistration = dateStr < fechaRegistro;

                    let bg = 'var(--surface-3)';
                    let color = 'var(--text-2)';
                    let border = '1px solid var(--border)';
                    let cursor = 'pointer';
                    let shadow = 'none';

                    if (isRegistrationDay) {
                        bg = `var(--color-${tipo}-soft)`;
                        color = `var(--color-${tipo})`;
                        border = `2px solid var(--color-${tipo})`;
                        if (isSelected) {
                            bg = `var(--color-${tipo})`;
                            color = '#fff';
                        }
                        if (isPaid) {
                            // Si ya está pagado, mantenemos el color de borde fuerte pero bajamos el fondo
                            bg = `var(--color-${tipo}-soft)`;
                            color = `var(--color-${tipo})`;
                            cursor = 'default';
                        }
                    } else if (isPaid) {
                        bg = 'rgba(255,255,255,0.05)';
                        color = 'var(--text-3)';
                        border = `1px solid var(--color-${tipo})`;
                        cursor = 'default';
                    } else if (isSelected) {
                        bg = `var(--color-${tipo})`;
                        color = '#fff';
                        border = `1px solid var(--color-${tipo})`;
                        shadow = `0 0 10px var(--color-${tipo})`;
                    } else if (isToday) {
                        border = '1px solid var(--text-3)';
                        color = 'var(--text-1)';
                    }

                    return (
                        <div
                            key={day}
                            onClick={() => !isPaid && onToggleDate(dateStr)}
                            style={{
                                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: bg, color: color, borderRadius: 6, fontSize: 12, fontWeight: 700,
                                border: border, cursor: cursor, transition: 'all 0.1s',
                                opacity: isBeforeRegistration && !isSelected && !isRegistrationDay ? 0.3 : 1,
                                boxShadow: shadow
                            }}
                        >
                            {day}
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
                {selectedDates.size} días seleccionados
            </div>
        </div>
    );
}
