import { useState, useEffect, useCallback, useRef } from 'react';
import HomeScreen from './components/HomeScreen';
import ClientDetail from './components/ClientDetail';
import AddClientModal from './components/AddClientModal';
import EditClientModal from './components/EditClientModal';
import { getClientesConMetaData, getPagosByCliente, syncOfflineData } from './db';
import { generateExcelPasaje } from './lib/excelGenerator';
import { useToast } from './hooks/useToast';
import './index.css';

// ─── SEGURIDAD DE ALMACENAMIENTO ──────────────────────────────
const safeStorage = {
  get: (key, fallback = null) => {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.error('Storage Get Error:', key, e);
      return fallback;
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('Storage Set Error:', key, e);
    }
  }
};

export default function App() {
  const [clientes, setClientes] = useState([]);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pwaStatus, setPwaStatus] = useState('VERIFICANDO...');
  const { toast, showToast } = useToast();
  const isSyncingRef = useRef(false);

  // ─── CARGA DE DATOS ──────────────────────────────────────────
  const reloadClientes = useCallback(async () => {
    try {
      const data = await getClientesConMetaData();
      if (data) setClientes(data);
    } catch (err) {
      console.error('Error reloading clientes:', err);
    }
  }, []);

  // ─── EXPORTACIÓN EXCEL ───────────────────────────────────────
  const handleExportPasaje = async (pasajeNombre, tipo = 'normal') => {
    try {
      showToast(`Generando Excel (${tipo.toUpperCase()}) para ${pasajeNombre}...`, '⏳');
      const q = pasajeNombre.trim().toLowerCase();
      const filtrados = clientes.filter(c => {
        const matchLugar = (c.lugar || '').trim().toLowerCase() === q || 
                          (c.pasaje || '').trim().toLowerCase() === q;
        const matchTipo = c.tipoAhorro === tipo || c.tipoAhorro === 'ambos';
        return matchLugar && matchTipo;
      });
      
      if (filtrados.length === 0) {
        showToast(`No hay clientes de tipo ${tipo.toUpperCase()} en este mercado`, '⚠️');
        return;
      }
      
      const dataFull = await Promise.all(filtrados.map(async c => {
        const todosPagos = await getPagosByCliente(c.id);
        return {
          ...c,
          pagos: todosPagos.filter(p => p.tipo === tipo)
        };
      }));

      await generateExcelPasaje(`${pasajeNombre} - ${tipo.toUpperCase()}`, dataFull);
      showToast('Excel generado con éxito', '✅');
    } catch (err) {
      console.error(err);
      showToast('Error al generar Excel', '❌');
    }
  };

  // ─── LOGICA DE SINCRONIZACIÓN Y OFFLINE ──────────────────────
  useEffect(() => {
    reloadClientes();

    const triggerSync = async () => {
      if (isSyncingRef.current || !navigator.onLine) return;
      isSyncingRef.current = true;
      try {
        const { synced } = await syncOfflineData();
        if (synced > 0) {
          showToast(`Sincronizados ${synced} pagos`, '☁️');
          reloadClientes();
        }
      } catch (err) {
        console.error('Sync error:', err);
      } finally {
        isSyncingRef.current = false;
      }
    };

    const runPeriodicWork = () => {
      const queue = safeStorage.get('pending_pagos', []);
      setPendingCount(queue.length);
      if (navigator.onLine && queue.length > 0) {
        triggerSync();
      }
    };

    const handleOfflineReady = () => {
      setPwaStatus('LISTO: OFFLINE OK');
      showToast('✅ App lista para usar sin internet', '🚀');
    };

    const handleRegistered = () => {
      setPwaStatus('LISTO: CACHÉ ACTIVA');
    };

    runPeriodicWork();
    
    const interval = setInterval(runPeriodicWork, 15000); 
    window.addEventListener('online', triggerSync);
    window.addEventListener('app-offline-ready', handleOfflineReady);
    window.addEventListener('app-registered', handleRegistered);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', triggerSync);
      window.removeEventListener('app-offline-ready', handleOfflineReady);
      window.removeEventListener('app-registered', handleRegistered);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  return (
    <>
      {/* ─── BARRA DE DIAGNÓSTICO (NUEVA: SUPER VISIBLE) ─── */}
      <div style={{ background: '#b91c1c', color: '#fff', fontSize: '10px', padding: '4px', textAlign: 'center', fontWeight: '900', zIndex: 10000, position: 'sticky', top: 0 }}>
        [ DEPURACIÓN ] ESTADO: {pwaStatus} | RED: {navigator.onLine ? 'CONECTADO' : 'SIN RED'}
      </div>

      {/* Vista activa */}
      {clienteActivo ? (
        <ClientDetail
          key={clienteActivo.id}
          cliente={clienteActivo}
          onBack={handleBack}
          onDelete={handleClientDeleted}
          onEdit={handleEditClient}
          showToast={showToast}
        />
      ) : (
        <HomeScreen 
          clientes={clientes} 
          onAddClient={() => setShowAdd(true)} 
          onSelectClient={setClienteActivo}
          onExport={handleExportPasaje}
        />
      )}

      {/* Modal: Agregar cliente */}
      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onSaved={handleClientAdded}
        />
      )}

      {/* Modal: Editar cliente */}
      {clienteEditando && (
        <EditClientModal
          cliente={clienteEditando}
          onClose={() => setClienteEditando(null)}
          onSaved={handleClientEdited}
        />
      )}

      {/* Indicador de Offline / Sincronización */}
      {(!navigator.onLine || pendingCount > 0) && (
        <div className={`offline-badge ${!navigator.onLine ? 'is-offline' : 'is-pending'}`}>
          {!navigator.onLine ? '⚠️ Sin conexión' : '☁️ Sincronizando...'}
          {pendingCount > 0 && <span> ({pendingCount} pagos pendientes)</span>}
        </div>
      )}

      {/* Toast global */}
      <div className={`toast ${toast.visible ? 'visible' : ''}`} role="status" aria-live="polite">
        <span className="toast-icon">{toast.icon}</span>
        {toast.message}
      </div>
    </>
  );

  function handleBack() {
    setClienteActivo(null);
    reloadClientes();
  }

  function handleClientAdded(nuevo) {
    reloadClientes();
    showToast(`${nuevo.nombre} agregado`, '🎉');
  }

  function handleClientDeleted(id) {
    setClienteActivo(null);
    reloadClientes();
    showToast('Cliente eliminado', '🗑️');
  }

  function handleEditClient(cliente) {
    setClienteEditando(cliente);
  }

  function handleClientEdited(actualizado) {
    setClienteActivo(actualizado);
    reloadClientes();
    showToast('Cliente actualizado', '✅');
  }
}
