import { useState, useEffect, useCallback, useRef } from 'react';
import { Home, Plus, BarChart3, LogOut, Users } from 'lucide-react';
import HomeScreen from './components/HomeScreen';
import ClientDetail from './components/ClientDetail';
import AddClientModal from './components/AddClientModal';
import EditClientModal from './components/EditClientModal';
import ReportsScreen from './components/ReportsScreen';
import SplashScreen from './components/SplashScreen';
import LoginScreen from './components/LoginScreen';
import UsersScreen from './components/UsersScreen';
import { getClientesConMetaData, getPagosByCliente, syncOfflineData, forceSyncClientToGoogleDrive, getTotalPendingCount, migrateFromLocalStorage, clearSyncQueue, isUserOnline, checkRealConnectivity, requeueErrors, repairSyncQueue } from './db';
import { generateExcelPasaje } from './lib/excelGenerator';
import { useToast } from './hooks/useToast';
import { useAuth } from './context/AuthContext';
import './index.css';
import './offline.css';

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
  const { session, profile, authLoading, signIn, signOut, isAdmin, isCobrador, userName, userRole } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(isUserOnline());
  const [activeView, setActiveView] = useState('home'); // 'home' | 'reports' | 'users'
  const [syncRemaining, setSyncRemaining] = useState(0);
  const [syncDoneMsg, setSyncDoneMsg] = useState(false);
  const { toast, showToast } = useToast();
  const isSyncingRef = useRef(false);

  // ─── SPLASH SCREEN ──────────────────────────────────────────
  useEffect(() => {
    // Migrar datos de localStorage a IndexedDB (una sola vez)
    migrateFromLocalStorage().then(() => {
      console.log('[App] Migración verificada.');
    });

    if (!isLoading && !authLoading) {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isLoading, authLoading]);

  // ─── CARGA DE DATOS ──────────────────────────────────────────
  const reloadClientes = useCallback(async () => {
    try {
      const data = await getClientesConMetaData();
      if (data) setClientes(data);
    } catch (err) {
      console.error('Error reloading clientes:', err);
    } finally {
      setIsLoading(false);
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
    // navigator.onLine es una pista, pero no una garantía. Intentamos siempre que sea posible.
    if (isSyncingRef.current) return;
    
    const count = await getTotalPendingCount();
    if (count === 0) return;

    // Si no hay red según el navegador, ni lo intentamos
    if (!navigator.onLine) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const startTime = Date.now();
    try {
      console.log('🔄 Iniciando sincronización automática...');
      const { synced, failed } = await syncOfflineData();
      if (synced > 0) {
        showToast(`Sincronizados ${synced} cambios`, '☁️');
        reloadClientes();
      }
      // Auto-desbloqueo de emergencia (más agresivo: 15s)
      if (isSyncingRef.current && Date.now() - (window._lastSyncStart || 0) > 15000) {
          console.warn('[Sync] Forzando desbloqueo del motor...');
          isSyncingRef.current = false;
      }
      if (failed > 0) {
        console.warn(`Sincronización parcial: ${failed} fallos.`);
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      const elapsed = Date.now() - startTime;
      const minTime = 800;
      if (elapsed < minTime) {
        setTimeout(() => {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }, minTime - elapsed);
      } else {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    }
  }, [reloadClientes, showToast]);

  useEffect(() => {
    if (session) {
      reloadClientes();
    } else {
      setIsLoading(false);
    }

    const updatePendingCount = async () => {
      const count = await getTotalPendingCount();
      setPendingCount(count);
      if (count > 0 && navigator.onLine) triggerSync(); 
    };

    // Chequeo inicial inmediato y forzado
    const initCheck = async () => {
      const reallyOnline = await checkRealConnectivity(true);
      setIsOnline(reallyOnline);
      if (reallyOnline) {
        await repairSyncQueue();
        triggerSync();
      }
    };
    initCheck();
    updatePendingCount();
    
    const handleOnline = async () => { 
      setIsOnline(true); // Cambio visual INSTANTÁNEO
      console.log('🌐 Conexión detectada por el sistema...');
      const reallyOnline = await checkRealConnectivity(true);
      setIsOnline(reallyOnline); // Confirmación real
      if (reallyOnline) triggerSync(); 
    };
    const handleOffline = async () => { 
      setIsOnline(false); // Cambio visual INSTANTÁNEO
      console.log('❌ Conexión perdida.');
      // Verificar por debajo pero el UI ya cambió
      await checkRealConnectivity(true);
    };
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const reallyOnline = await checkRealConnectivity(true);
        setIsOnline(reallyOnline);
        if (reallyOnline) triggerSync();
      }
    };
    
    const handleSyncProgress = (e) => {
      const { remaining, phase } = e.detail;
      setSyncRemaining(remaining);
      if (phase === 'done') {
        setSyncDoneMsg(true);
        setTimeout(() => setSyncDoneMsg(false), 3000);
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('offline-queue-updated', updatePendingCount);
    window.addEventListener('sync-success', reloadClientes);
    window.addEventListener('sync-progress', handleSyncProgress);
    
    // Intervalo de seguridad para sync periódico y actualizar estado online
    const interval = setInterval(async () => {
      updatePendingCount();
      const reallyOnline = await checkRealConnectivity();
      setIsOnline(reallyOnline);
      if (reallyOnline) triggerSync();
    }, 15000);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('offline-queue-updated', updatePendingCount);
      window.removeEventListener('sync-success', reloadClientes);
      window.removeEventListener('sync-progress', handleSyncProgress);
    };
  }, [triggerSync, reloadClientes, session]); 

  // ─── AUTH GUARDS ─────────────────────────────────────────────
  if (authLoading) return <SplashScreen isFinished={false} />;
  if (!session) return <LoginScreen onLogin={signIn} />;

  async function handleGlobalSync() {
    if (!navigator.onLine) {
      showToast('No hay conexión para sincronizar', '📶');
      return;
    }
    
    showToast('Forzando sincronización...', '🔄');
    
    try {
      // RESET DE SEGURIDAD: Desbloqueamos cualquier proceso trabado
      isSyncingRef.current = false;
      setIsSyncing(false);
      
      // Forzar recarga de errores para que vuelvan a intentarlo
      await requeueErrors(999); 
      
      // Ejecutar sincronización
      const { synced, failed } = await syncOfflineData();
      
      // Recargar datos limpios
      await reloadClientes();
      
      if (synced > 0) {
        showToast(`¡${synced} pagos subidos con éxito!`, '✅');
      } else if (failed > 0) {
        showToast(`Quedan ${failed} items con error.`, '⚠️');
      } else {
        showToast('Todo está al día', '✅');
      }
    } catch (err) {
      console.error(err);
      showToast('Error en el desbloqueo', '❌');
    }
  }

  return (
    <>
      {showSplash && <SplashScreen isFinished={!isLoading} />}

      {/* ─── INDICADOR DE CONEXIÓN (Pill minimal top-right) ─── */}
      <div className={`offline-badge ${!isOnline ? 'is-offline' : (isSyncing || pendingCount > 0 ? 'is-syncing' : 'is-online')}`}>
        {!isOnline ? (
          <>
            <div className="badge-dot" />
            <span>OFFLINE{pendingCount > 0 ? ` · ${pendingCount}` : ''}</span>
            {pendingCount > 10 && (
              <button 
                className="badge-clean-btn"
                onClick={async (e) => {
                  e.stopPropagation();
                  if(window.confirm(`¿Limpiar ${pendingCount} tareas pendientes?`)) {
                    await clearSyncQueue();
                    setPendingCount(0);
                    showToast('Cola limpiada ✓', '🧹');
                  }
                }}
              >
                LIMPIAR
              </button>
            )}
          </>
        ) : isSyncing || pendingCount > 0 ? (
          <>
            <div className="badge-spinner" />
            <span>SYNC · {pendingCount}</span>
          </>
        ) : (
          <>
            <div className="badge-dot" />
            <span>EN LÍNEA</span>
          </>
        )}
      </div>

      {/* Vista activa */}
      <main className="content-area" style={{ flex: 1, paddingBottom: 84 }}>
        {clienteActivo ? (
          <ClientDetail
            key={clienteActivo.id}
            cliente={clienteActivo}
            onBack={handleBack}
            onDelete={handleClientDeleted}
            onEdit={handleEditClient}
            showToast={showToast}
            userRole={userRole}
          />
        ) : activeView === 'reports' ? (
          <ReportsScreen clientes={clientes} showToast={showToast} />
        ) : activeView === 'users' && isAdmin ? (
          <UsersScreen />
        ) : (
          <HomeScreen 
            clientes={clientes} 
            onAddClient={() => setShowAdd(true)} 
            onSelectClient={setClienteActivo}
            onExport={handleExportPasaje}
            onSyncClient={handleSyncClient}
            onGlobalSync={handleGlobalSync}
            isGlobalSyncing={isSyncing}
            pendingCount={pendingCount}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      {!clienteActivo && (
        <nav className="bottom-nav">
          <button className={`nav-item ${activeView === 'home' ? 'active' : ''}`} onClick={() => setActiveView('home')}>
            <div className="nav-item-icon"><Home size={22} /></div>
            <span className="nav-item-label">Inicio</span>
          </button>
          
          {isAdmin && (
            <>
              <button className="nav-item" onClick={() => setShowAdd(true)}>
                <div className="nav-item-icon" style={{ 
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', 
                  color: 'white', 
                  borderRadius: '50%', 
                  width: 48, 
                  height: 48, 
                  marginTop: -24, 
                  boxShadow: '0 4px 15px var(--primary-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '4px solid var(--surface-1)'
                }}>
                  <Plus size={28} strokeWidth={3} />
                </div>
              </button>
              <button className={`nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => setActiveView('reports')}>
                <div className="nav-item-icon"><BarChart3 size={22} /></div>
                <span className="nav-item-label">Reportes</span>
              </button>
              <button className={`nav-item ${activeView === 'users' ? 'active' : ''}`} onClick={() => setActiveView('users')}>
                <div className="nav-item-icon"><Users size={22} /></div>
                <span className="nav-item-label">Usuarios</span>
              </button>
            </>
          )}
          
          {isCobrador && (
            <button className="nav-item" onClick={signOut}>
              <div className="nav-item-icon"><LogOut size={22} /></div>
              <span className="nav-item-label">Salir</span>
            </button>
          )}
        </nav>
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
    // 1. Actualización optimista INSTANTÁNEA
    setClientes(prev => {
      if (prev.find(c => c.id === nuevo.id)) return prev;
      const newList = [nuevo, ...prev];
      return newList.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    });
    
    // 2. Notificación visual
    showToast(`${nuevo.nombre} agregado`, '🎉');

    // 3. RETARDO DE SEGURIDAD: 
    // Esperamos 2.5 segundos para recargar la lista oficial.
    // Esto evita que la base de datos nos devuelva la lista "vieja" 
    // mientras aún está procesando el nuevo registro.
    setTimeout(() => {
      reloadClientes();
      triggerSync();
    }, 2500);
  }

  function handleClientDeleted(id) {
    setClienteActivo(null);
    
    // Actualización optimista
    setClientes(prev => prev.filter(c => c.id !== id));
    
    // Recarga
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

  async function handleSyncClient(id) {
    showToast('Sincronizando con Drive...', '⏳');
    const success = await forceSyncClientToGoogleDrive(id);
    if (success) {
      showToast('Enviado a Drive', '☁️');
    } else {
      showToast('Error al sincronizar', '❌');
    }
  }
}
