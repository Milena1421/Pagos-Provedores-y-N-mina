
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { PaymentForm } from './components/PaymentForm';
import { PaymentTable } from './components/PaymentTable';
import { ProviderDirectory } from './components/ProviderDirectory';
import { PaymentRecord, ViewType, PaymentStatus, Provider, DocumentType, BankAccountType, SupportFile } from './types';
import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase
const supabaseUrl = 'https://xfsbogjozqvaphoapqnz.supabase.co';
const supabaseKey = 'sb_publishable_PL1m0jMzLteH19aQWAY2oA_pb6-FMIe';
export const supabase = createClient(supabaseUrl, supabaseKey);

const App: React.FC = () => {
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info' | 'warning'} | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return localStorage.getItem('admin_notification_email') || 'tesoreria@ingenieria365.com';
  });

  useEffect(() => {
    localStorage.setItem('admin_notification_email', adminEmail);
  }, [adminEmail]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: providersData, error: providersError } = await supabase.from('providers').select('*');
      if (providersError && providersError.code !== 'PGRST204') throw providersError;

      const { data: recordsData, error: recordsError } = await supabase
        .from('payment_records')
        .select('*')
        .order('createdAt', { ascending: false });
      if (recordsError && recordsError.code !== 'PGRST204') throw recordsError;

      setRecords(recordsData || []);
      setProviders(providersData || []);
    } catch (e: any) {
      console.error('Error fetching data:', e);
      showNotification(`Error de conexión: ${e.message}`, 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showNotification = (message: string, type: 'success' | 'info' | 'warning') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 10000);
  };

  const sendEmailNotification = async (record: PaymentRecord, provider: Provider) => {
    const recipients = adminEmail
      .split(/[;,]/)
      .map(e => e.trim())
      .filter(e => e.includes('@') && e.includes('.'));
    
    if (recipients.length === 0) {
      showNotification('Configure al menos un correo válido en la barra lateral.', 'warning');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('resend-email', {
        body: { 
          record, 
          provider, 
          to: recipients 
        }
      });

      if (error) {
        const status = (error as any).status || (error as any).context?.status;
        if (status === 401) {
          showNotification('⚠️ ERROR: Falta RESEND_API_KEY en Supabase.', 'warning');
        } else {
          showNotification(`Falla en notificación: ${error.message}`, 'warning');
        }
        return;
      }
      showNotification(`Notificación enviada con éxito.`, 'success');
    } catch (err: any) {
      showNotification('Error de red al enviar la notificación.', 'warning');
    }
  };

  const handleResendEmail = async (record: PaymentRecord) => {
    const provider = providers.find(p => p.identificacion === record.identificacion);
    if (!provider) {
      showNotification('No se encontró el proveedor.', 'warning');
      return;
    }
    showNotification('Reenviando correo...', 'info');
    await sendEmailNotification(record, provider);
  };

  const handleSubmission = async (data: { record: PaymentRecord, provider: Provider }) => {
    const { record, provider } = data;
    const isNew = !editingRecord;
    
    try {
      const { error: pError } = await supabase.from('providers').upsert(provider);
      if (pError) throw pError;

      const { error: rError } = await supabase.from('payment_records').upsert(record);
      if (rError) throw rError;

      await fetchData();
      
      if (isNew) {
        showNotification(`Radicado ${record.radicado} guardado.`, 'success');
        sendEmailNotification(record, provider);
      } else {
        setEditingRecord(null);
        showNotification(`Cambios guardados.`, 'info');
      }
      
      setCurrentView('table');
    } catch (e: any) {
      showNotification(`Error al guardar: ${e.message}`, 'warning');
    }
  };

  const handleProvidersUpdate = async (updatedProviders: Provider[]) => {
    try {
      const { error } = await supabase.from('providers').upsert(updatedProviders);
      if (error) throw error;
      setProviders(updatedProviders);
      showNotification('Directorio actualizado.', 'success');
    } catch (e: any) {
      showNotification(`Error al actualizar directorio: ${e.message}`, 'warning');
    }
  };

  const deleteProvider = async (identificacion: string) => {
    if (window.confirm('¿Desea eliminar este proveedor? Esto no borrará sus radicados existentes.')) {
      setLoading(true);
      try {
        const { error } = await supabase.from('providers').delete().eq('identificacion', identificacion);
        if (error) throw error;
        setProviders(prev => prev.filter(p => p.identificacion !== identificacion));
        showNotification('Proveedor eliminado correctamente.', 'success');
      } catch (e: any) {
        showNotification(`Error: No se pudo eliminar.`, 'warning');
      } finally {
        setLoading(false);
      }
    }
  };

  const updateStatus = async (id: string, newStatus: PaymentStatus, extra?: { comprobante?: string, motivo?: string, comprobanteFile?: SupportFile }) => {
    try {
      const updates: any = { estado: newStatus, comprobantePago: extra?.comprobante, motivoDevolucion: extra?.motivo };
      if (extra?.comprobanteFile) updates.comprobanteFile = extra.comprobanteFile;

      const { error } = await supabase.from('payment_records').update(updates).eq('id', id);
      if (error) throw error;
      
      setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
      showNotification('Estado actualizado.', 'success');
    } catch (e: any) {
      showNotification('Error al actualizar el estado.', 'info');
    }
  };

  const deleteRecord = async (id: string) => {
    if (window.confirm('¿Desea eliminar este radicado definitivamente?')) {
      try {
        const { error } = await supabase.from('payment_records').delete().eq('id', id);
        if (error) throw error;
        setRecords(prev => prev.filter(r => r.id !== id));
        showNotification('Radicado eliminado.', 'info');
      } catch (e) {
        showNotification('No se pudo eliminar el registro.', 'info');
      }
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      onViewChange={setCurrentView}
      adminEmail={adminEmail}
      onAdminEmailChange={setAdminEmail}
    >
      {notification && (
        <div className={`fixed top-6 right-6 z-[300] p-6 rounded-2xl shadow-2xl border-l-8 flex items-center space-x-4 transition-all duration-500 animate-in slide-in-from-right-full max-w-md ${
          notification.type === 'success' ? 'bg-green-50 border-green-600 text-green-900' : 
          notification.type === 'warning' ? 'bg-red-50 border-red-600 text-red-900' : 'bg-blue-50 border-blue-600 text-blue-900'
        }`}>
          <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white shadow-lg ${
            notification.type === 'success' ? 'bg-green-600' : 
            notification.type === 'warning' ? 'bg-red-600' : 'bg-blue-600'
          }`}>
            {notification.type === 'success' ? '✓' : notification.type === 'warning' ? '!' : 'i'}
          </div>
          <div className="flex-1">
             <p className="text-sm font-black uppercase tracking-tight leading-tight">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-indigo-800 font-bold animate-pulse">Sincronizando...</p>
          </div>
        </div>
      )}

      {currentView === 'dashboard' && <Dashboard records={records} onAddClick={() => setCurrentView('form')} />}
      
      {currentView === 'form' && (
        <PaymentForm 
          onSubmit={handleSubmission} 
          onCancel={() => { setEditingRecord(null); setCurrentView('table'); }}
          initialData={editingRecord}
          nextRadicado={records.length > 0 ? (Math.max(...records.map(r => {
            const num = parseInt(r.radicado.replace('RAD-', ''));
            return isNaN(num) ? 0 : num;
          })) + 1).toString().padStart(4, '0') : '0001'}
          providers={providers}
        />
      )}

      {currentView === 'table' && (
        <PaymentTable 
          records={records} 
          providers={providers}
          onEdit={r => { setEditingRecord(r); setCurrentView('form'); }} 
          onDelete={deleteRecord} 
          onStatusChange={updateStatus} 
          onResendEmail={handleResendEmail}
        />
      )}

      {currentView === 'directory' && (
        <ProviderDirectory 
          providers={providers} 
          onUpdate={handleProvidersUpdate} 
          onDelete={deleteProvider}
        />
      )}
    </Layout>
  );
};

export default App;
