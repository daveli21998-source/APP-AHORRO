import { useState, useEffect, useCallback } from 'react';
import HomeScreen from './components/HomeScreen';
import ClientDetail from './components/ClientDetail';
import AddClientModal from './components/AddClientModal';
import EditClientModal from './components/EditClientModal';
import { getClientesConMetaData, getPagosByCliente } from './db';
import { generateExcelPasaje } from './lib/excelGenerator';
import { useToast } from './hooks/useToast';
import './index.css';

export default function App() {
  const [clientes, setClientes] = useState([]);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const { toast, showToast } = useToast();

  const reloadClientes = useCallback(async () => {
    const data = await getClientesConMetaData();
    setClientes(data);
  }, []);

  const handleExportPasaje = async (pasajeNombre, tipo = 'normal') => {
    try {
      showToast(`Generando Excel (${tipo.toUpperCase()}) para ${pasajeNombre}...`, '⏳');
      // 1. Filtrar clientes de ese lugar que tengan ese tipo de ahorro (o ambos)
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
      
      // 2. Cargar pagos para cada cliente (solo del tipo solicitado)
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

  useEffect(() => {
    reloadClientes();
  }, [reloadClientes]);

  function handleSelectClient(cliente) {
    setClienteActivo(cliente);
  }

  function handleBack() {
    setClienteActivo(null);
    reloadClientes(); // Refrescar totales al volver
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

  return (
    <>
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

      {/* Toast global */}
      <div className={`toast ${toast.visible ? 'visible' : ''}`} role="status" aria-live="polite">
        <span className="toast-icon">{toast.icon}</span>
        {toast.message}
      </div>
    </>
  );
}
