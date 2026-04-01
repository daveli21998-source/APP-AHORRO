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
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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
  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;
    
    const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
    if (queue.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const { synced } = await syncOfflineData();
      if (synced > 0) {
        showToast(`Sincronizados ${synced} cambios`, '☁️');
        reloadClientes();
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [reloadClientes, showToast]);

  useEffect(() => {
    reloadClientes();

    const updatePendingCount = () => {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
      setPendingCount(queue.length);
      if (queue.length > 0 && navigator.onLine) triggerSync(); 
    };

    updatePendingCount();
    if (navigator.onLine) triggerSync();
    
    const handleOnline = () => { setIsOnline(true); triggerSync(); };
    const handleOffline = () => { setIsOnline(false); };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', updatePendingCount);
    window.addEventListener('sync-success', reloadClientes); // Refrescar lista si algo se subió
    
    // Intervalo de seguridad para sync periódico
    const interval = setInterval(() => {
      updatePendingCount();
      if (navigator.onLine) triggerSync();
    }, 5000); // 5 segundos para máxima frescura
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', updatePendingCount);
      window.removeEventListener('sync-success', reloadClientes);
    };
  }, [triggerSync, reloadClientes]); 

  return (
    <>
      {/* ─── INDICADOR DE ESTADO (MODERNO) ─── */}
      <div className={`status-bar ${!isOnline ? 'is-offline' : (isSyncing ? 'is-syncing' : '')}`}>
        {!isOnline ? '🛑 Sin Conexión (Modo Offline)' : (isSyncing ? '🔄 Sincronizando datos...' : '✅ En Línea')}
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

      {/* Indicador de items pendientes (SOLO SI NO HAY INTERNET) */}
      {pendingCount > 0 && !isOnline && (
        <div className="pending-badge" onClick={triggerSync}>
          ☁️ {pendingCount} cambios guardados localmente
        </div>
      )}

      {/* Versión de la App (Footer informativo) */}
      <div className="app-version-label">
        Versión 1.0.1 (Offline CRUD v2)
      </div>

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
    triggerSync(); // Intentar subir de inmediato
    showToast(`${nuevo.nombre} agregado`, '🎉');
  }

  function handleClientDeleted(id) {
    setClienteActivo(null);
    reloadClientes();
    triggerSync();
    showToast('Cliente eliminado', '🗑️');
  }

  function handleEditClient(cliente) {
    setClienteEditando(cliente);
  }

  function handleClientEdited(actualizado) {
    setClienteActivo(actualizado);
    reloadClientes();
    triggerSync();
    showToast('Cliente actualizado', '✅');
  }
}
