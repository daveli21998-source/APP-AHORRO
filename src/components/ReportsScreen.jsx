import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  ChevronDown, 
  FileDown, 
  Users, 
  MapPin,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '../db';
import { generateExcelPasaje, prepareExcelBuffer } from '../lib/excelGenerator';

export default function ReportsScreen({ clientes, showToast }) {
  const [lugaresExpandidos, setLugaresExpandidos] = useState({});
  const [activeTab, setActiveTab] = useState('normal'); // 'normal' | 'puesto'
  const [isExporting, setIsExporting] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [cachedPagos, setCachedPagos] = useState({});
  const [cachedBuffers, setCachedBuffers] = useState({});

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(c => c.tipoAhorro === activeTab || c.tipoAhorro === 'ambos');
  }, [clientes, activeTab]);

  const agrupado = useMemo(() => {
    return clientesFiltrados.reduce((acc, c) => {
      const l = c.lugar || 'Sin Lugar';
      const p = c.pasaje || 'Sin Pasaje';
      if (!acc[l]) acc[l] = {};
      if (!acc[l][p]) acc[l][p] = [];
      acc[l][p].push(c);
      return acc;
    }, {});
  }, [clientesFiltrados]);

  const lugaresOrdenados = useMemo(() => Object.keys(agrupado).sort(), [agrupado]);

  const totalTab = useMemo(() => {
    return clientesFiltrados.reduce((sum, c) => {
       const keyMonto = activeTab === 'normal' ? 'totalNormal' : 'totalPuesto';
       return sum + (c[keyMonto] || c.totalAcumulado || 0);
    }, 0);
  }, [clientesFiltrados, activeTab]);

  const [showClientesPasaje, setShowClientesPasaje] = useState({});

  const toggleLugar = (lugar) => {
    setLugaresExpandidos(prev => ({ ...prev, [lugar]: !prev[lugar] }));
  };

  const toggleClientesPasaje = (lugar, pasaje) => {
    const key = `${lugar}-${pasaje}`;
    setShowClientesPasaje(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Pre-carga silenciosa y GENERACIÓN EN CALIENTE
  useEffect(() => {
    const prefetch = async () => {
      const ids = clientesFiltrados.map(c => c.id);
      if (ids.length === 0) return;
      try {
        const { data } = await supabase.from('ahorros_pagos').select('*').in('cliente_id', ids);
        if (data) {
          const mapped = data.reduce((acc, p) => {
            if (!acc[p.cliente_id]) acc[p.cliente_id] = [];
            acc[p.cliente_id].push(p);
            return acc;
          }, {});
          setCachedPagos(mapped);

          // Generación de Buffers en segundo plano (Hot Generation)
          const newBuffers = {};
          for (const l of lugaresOrdenados) {
            for (const p of Object.keys(agrupado[l])) {
              const filtrados = agrupado[l][p] || [];
              const dataFull = filtrados.map(c => ({
                ...c,
                pagos: (mapped[c.id] || []).filter(pay => pay.tipo === activeTab || (!pay.tipo && activeTab === 'normal'))
              }));
              const title = `REPORTE_${l}_${p}_${activeTab}`.replace(/\s+/g, '_');
              newBuffers[`${l}-${p}`] = await prepareExcelBuffer(title, dataFull);
            }
          }
          setCachedBuffers(newBuffers);
        }
      } catch (err) {
        console.warn('Error en pre-carga:', err);
      }
    };
    prefetch();
  }, [clientesFiltrados]);

  const handleExport = async (lugar, pasaje) => {
    if (isExporting) return;
    setIsExporting(true);
    
    const notify = typeof showToast === 'function' ? showToast : console.log;
    
    try {
      notify(`Iniciando envío: ${pasaje}...`, '⏳');
      const key = `${lugar}-${pasaje}`;
      const preBuffer = cachedBuffers[key];
      
      const filtrados = agrupado[lugar][pasaje] || [];
      const dataFull = filtrados.map(c => ({
        ...c,
        pagos: (cachedPagos[c.id] || []).filter(p => p.tipo === activeTab || (!p.tipo && activeTab === 'normal'))
      }));
      
      const fileName = `REPORTE_${lugar.replace(/\s+/g, '_')}_${pasaje.replace(/\s+/g, '_')}_${activeTab.toUpperCase()}`;
      
      // Enviamos el buffer pre-generado para que sea instantáneo
      await generateExcelPasaje(fileName, dataFull, preBuffer);
      
      notify('Reporte enviado ✓', '📊');
    } catch (error) {
      console.error('[Report] Error:', error);
      notify('Error al enviar reporte', '❌');
    } finally {
      setIsExporting(false);
    }
  };

  const formatMoney = (n) => 'S/ ' + (n || 0).toFixed(0); // Sin decimales como en la foto

  return (
    <div className="reports-container page-enter" style={{ paddingBottom: 100 }}>
      <div className="topbar" style={{ padding: '20px 16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', letterSpacing: 1.5, marginBottom: 4 }}>
          ANÁLISIS DE RECAUDACIÓN
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)' }}>
          Reportes Detallados
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: 10 }}>
          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            background: 'var(--surface-2)', 
            borderRadius: '16px', 
            padding: '6px', 
            marginBottom: 20 
          }}>
            <button 
              onClick={() => setActiveTab('normal')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                background: activeTab === 'normal' ? 'rgba(0, 230, 118, 0.1)' : 'transparent',
                border: activeTab === 'normal' ? '1px solid var(--primary)' : '1px solid transparent',
                color: activeTab === 'normal' ? 'var(--info)' : 'var(--text-3)',
                fontWeight: 800,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: 16 }}>💰</span> NORMAL
            </button>
            <button 
              onClick={() => setActiveTab('puesto')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                background: activeTab === 'puesto' ? 'rgba(255, 152, 0, 0.1)' : 'transparent',
                border: activeTab === 'puesto' ? '1px solid var(--color-puesto)' : '1px solid transparent',
                color: activeTab === 'puesto' ? 'var(--color-puesto)' : 'var(--text-3)',
                fontWeight: 800,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: 16 }}>🏪</span> PUESTO
            </button>
          </div>

          {/* Resumen Total */}
          <div 
            onClick={() => setShowTotal(!showTotal)}
            style={{ 
              background: 'var(--surface-2)', 
              border: activeTab === 'normal' ? '1px solid var(--info)' : '1px solid var(--color-puesto)',
              borderRadius: '16px', 
              padding: '24px', 
              textAlign: 'center',
              marginBottom: 24,
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
              cursor: 'pointer'
            }}>
             <div style={{ fontSize: 32, fontWeight: 900, color: activeTab === 'normal' ? 'var(--info)' : 'var(--color-puesto)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {showTotal ? formatMoney(totalTab) : 'S/ ****'}
                {showTotal ? <EyeOff size={24} style={{ opacity: 0.5 }} /> : <Eye size={24} style={{ opacity: 0.5 }} />}
             </div>
             <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 1.5 }}>
                TOTAL {activeTab.toUpperCase()}
             </div>
          </div>
      </div>

      <div className="reports-list" style={{ padding: '0 16px' }}>
        {lugaresOrdenados.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <div className="empty-title">Sin datos para reportes</div>
            <div className="empty-desc">Agrega clientes para ver estadísticas aquí</div>
          </div>
        ) : (
          lugaresOrdenados.map(lugar => {
            const pasajes = agrupado[lugar];
            const isExpanded = lugaresExpandidos[lugar];

            return (
              <div key={lugar} style={{ 
                background: 'var(--surface-1)', 
                border: '1px solid rgba(0, 230, 118, 0.15)', 
                borderRadius: '16px', 
                marginBottom: 16,
                overflow: 'hidden'
              }}>
                {/* Accordion Header */}
                <div 
                  onClick={() => toggleLugar(lugar)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(0, 230, 118, 0.03)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid rgba(0, 230, 118, 0.1)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MapPin size={20} color="var(--text-1)" />
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', letterSpacing: 0.5 }}>
                      {lugar.toUpperCase()}
                    </span>
                  </div>
                  <ChevronDown 
                    size={20} 
                    color="var(--text-1)"
                    style={{ 
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.25s'
                    }} 
                  />
                </div>

                {/* Accordion Content */}
                {isExpanded && (
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Object.entries(pasajes).sort().map(([pasaje, clientesPasaje]) => {
                      const totalPasaje = clientesPasaje.reduce((sum, c) => {
                         const keyMonto = activeTab === 'normal' ? 'totalNormal' : 'totalPuesto';
                         return sum + (c[keyMonto] || c.totalAcumulado || 0);
                      }, 0);
                      
                      const keyPasaje = `${lugar}-${pasaje}`;
                      const isShowing = showClientesPasaje[keyPasaje];

                      return (
                        <div key={pasaje} style={{ 
                          background: 'var(--surface-2)', 
                          border: '1px solid rgba(255, 255, 255, 0.05)', 
                          borderRadius: '14px', 
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12
                        }}>
                          {/* Info Row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                               <span>🚪</span> {pasaje}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                 <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-2)' }}>{clientesPasaje.length}</span>
                                 <span style={{ fontSize: 12, color: 'var(--text-3)' }}>clientes</span>
                               </div>
                               <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>{formatMoney(totalPasaje)}</span>
                            </div>
                          </div>

                          {/* Buttons Row */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                             <button 
                               onClick={() => toggleClientesPasaje(lugar, pasaje)}
                               style={{ 
                                 flex: 1,
                                 minWidth: 0,
                                 padding: '10px 12px', 
                                 borderRadius: '10px',
                                 fontSize: 12, 
                                 fontWeight: 800,
                                 background: isShowing ? 'var(--primary)' : 'rgba(0, 230, 118, 0.1)', 
                                 border: '1px solid rgba(0, 230, 118, 0.3)', 
                                 color: isShowing ? '#fff' : 'var(--primary)',
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 justifyContent: 'center',
                                 gap: 6,
                                 transition: 'all 0.2s',
                                 whiteSpace: 'nowrap'
                               }}
                             >
                                <Users size={16} /> CLIENTES
                             </button>
                             <button 
                               onClick={() => handleExport(lugar, pasaje)}
                               disabled={isExporting}
                               style={{ 
                                 flex: 1,
                                 minWidth: 0,
                                 padding: '10px 12px', 
                                 borderRadius: '10px',
                                 fontSize: 12, 
                                 fontWeight: 800,
                                 background: 'transparent', 
                                 border: '1px solid var(--text-3)', 
                                 color: 'var(--text-1)',
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 justifyContent: 'center',
                                 gap: 6,
                                 opacity: isExporting ? 0.5 : 1,
                                 whiteSpace: 'nowrap'
                               }}
                             >
                                <FileDown size={16} /> {isExporting ? '...' : 'REPORTE'}
                             </button>
                          </div>

                          {/* Clients List (Toggleable) */}
                          {isShowing && (
                            <div style={{ 
                              marginTop: 4, 
                              paddingTop: 12, 
                              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                              animation: 'fadeIn 0.2s ease-out'
                            }}>
                               {clientesPasaje.map(c => (
                                 <div key={c.id} style={{ 
                                   fontSize: 13, 
                                   fontWeight: 700, 
                                   color: 'var(--text-2)',
                                   display: 'flex',
                                   alignItems: 'center',
                                   justifyContent: 'space-between',
                                   padding: '4px 8px',
                                   background: 'rgba(255, 255, 255, 0.02)',
                                   borderRadius: '8px'
                                 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)' }} />
                                      {c.nombre}
                                    </div>
                                    <div style={{ color: 'var(--primary)', fontSize: 12 }}>
                                      {formatMoney(activeTab === 'normal' ? c.totalNormal : c.totalPuesto)}
                                    </div>
                                 </div>
                               ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
