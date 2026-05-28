import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Dashboard } from './components/Dashboard';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { PaymentForm } from './components/PaymentForm';
import { PaymentTable } from './components/PaymentTable';
import { ProviderDirectory } from './components/ProviderDirectory';
import { appConfig, missingRequiredConfig } from './config';
import { AppUser, PaymentRecord, PaymentStatus, Provider, SupportFile, ViewType } from './types';

export const supabase = createClient(
  appConfig.supabaseUrl || 'https://missing-config.supabase.co',
  appConfig.supabaseAnonKey || 'missing-config'
);

const SESSION_KEY = 'control_pagos_current_user';
const TAX_BREAKDOWN_CACHE_KEY = 'control_pagos_tax_breakdown_cache';
const REQUIRED_NOTIFICATION_EMAILS = ['milenaperez@ingenieria365.com', 'eliza@ingenieria365.com'];

const APP_USERS: AppUser[] = [
  {
    id: 'admin',
    username: 'admin',
    password: 'Admin365!',
    displayName: 'Administrador',
    role: 'Administrador',
    permissions: {
      views: ['table', 'directory', 'form'],
      canManageNotifications: true,
      canManagePaymentStatus: true
    }
  },
  {
    id: 'pagos',
    username: 'pagos',
    password: 'Pagos365!',
    displayName: 'Pagos',
    role: 'Pagos',
    permissions: {
      views: ['table', 'form'],
      canManageNotifications: false,
      canManagePaymentStatus: true
    }
  },
  {
    id: 'contabilidad',
    username: 'contabilidad',
    password: 'Conta365!',
    displayName: 'Contabilidad',
    role: 'Contabilidad',
    permissions: {
      views: ['table', 'form'],
      canManageNotifications: false,
      canManagePaymentStatus: false
    }
  }
];

const getDefaultView = (user: AppUser | null): ViewType => user?.permissions.views[0] || 'table';

const App: React.FC = () => {
  if (missingRequiredConfig.length > 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-xl rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-300">Configuracion pendiente</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight">Faltan variables para conectar Supabase</h1>
          <p className="mt-4 text-sm leading-6 text-slate-200">
            Configura estas variables de entorno en Cloud Run y vuelve a desplegar el servicio:
          </p>
          <ul className="mt-4 space-y-2 text-sm font-mono text-emerald-100">
            {missingRequiredConfig.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const savedUserId = localStorage.getItem(SESSION_KEY);
    return APP_USERS.find((user) => user.id === savedUserId) || null;
  });
  const [currentView, setCurrentView] = useState<ViewType>(() => getDefaultView(APP_USERS.find((user) => user.id === localStorage.getItem(SESSION_KEY)) || null));
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return localStorage.getItem('admin_notification_email') || REQUIRED_NOTIFICATION_EMAILS.join(', ');
  });

  const availableViews = useMemo<ViewType[]>(() => currentUser?.permissions.views || [], [currentUser]);

  useEffect(() => {
    localStorage.setItem('admin_notification_email', adminEmail);
  }, [adminEmail]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(SESSION_KEY, currentUser.id);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setCurrentView('table');
      return;
    }

    if (!currentUser.permissions.views.includes(currentView)) {
      setCurrentView(getDefaultView(currentUser));
    }
  }, [currentUser, currentView]);

  const sanitizeEmail = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    return normalized && normalized.toLowerCase() !== 'null' ? normalized : '';
  };

  const normalizeProvider = (provider: any): Provider => ({
    ...provider,
    correo: sanitizeEmail(provider?.correo),
    direccion: typeof provider?.direccion === 'string' && provider.direccion.toLowerCase() !== 'null' ? provider.direccion : '',
    telefono: typeof provider?.telefono === 'string' && provider.telefono.toLowerCase() !== 'null' ? provider.telefono : '',
    entidadBancaria: typeof provider?.entidadBancaria === 'string' && provider.entidadBancaria.toLowerCase() !== 'null' ? provider.entidadBancaria : '',
    numeroCuenta: typeof provider?.numeroCuenta === 'string' && provider.numeroCuenta.toLowerCase() !== 'null' ? provider.numeroCuenta : ''
  });

  const showNotification = (message: string, type: 'success' | 'info' | 'warning') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 10000);
  };

  const invokeEmailFunction = async (payload: { record: PaymentRecord; provider: Provider; to: string[] | string }) => {
    const functionNames = ['resend-email', 'send-payment-email'];
    let lastError: any = null;

    for (const functionName of functionNames) {
      const response = await supabase.functions.invoke(functionName, { body: payload });

      if (!response.error) {
        return response;
      }

      const status = (response.error as any)?.status || (response.error as any)?.context?.status;
      const message = `${(response.error as any)?.message || ''}`.toLowerCase();
      const shouldTryLegacyFallback = functionName === 'resend-email' && (status === 404 || message.includes('not found'));

      if (!shouldTryLegacyFallback) {
        return response;
      }

      lastError = response.error;
    }

    return { data: null, error: lastError };
  };

  const readTaxBreakdownCache = (): Record<string, Pick<PaymentRecord, 'subtotal' | 'iva' | 'retefuente' | 'numeroDocumento'>> => {
    try {
      return JSON.parse(localStorage.getItem(TAX_BREAKDOWN_CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  };

  const cacheTaxBreakdown = (record: PaymentRecord) => {
    const cache = readTaxBreakdownCache();
    cache[record.id] = {
      subtotal: Number(record.subtotal || 0),
      iva: Number(record.iva || 0),
      retefuente: Number(record.retefuente || 0),
      numeroDocumento: typeof record.numeroDocumento === 'string' ? record.numeroDocumento : ''
    };
    localStorage.setItem(TAX_BREAKDOWN_CACHE_KEY, JSON.stringify(cache));
  };

  const normalizeMoneyValue = (value: unknown): number | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  };

  const normalizeDuplicateText = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  };

  const normalizeDuplicateId = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\./g, '').replace(/[^0-9-]/g, '');
  };

  const getDuplicateSignature = (record: PaymentRecord) => ({
    providerName: normalizeDuplicateText(record.proveedor),
    identification: normalizeDuplicateId(record.identificacion),
    documentNumber: normalizeDuplicateText(record.numeroDocumento),
    documentDate: normalizeDuplicateText(record.fechaDocumento),
    category: normalizeDuplicateText(record.categoria),
    value: Math.round(Number(record.valor || 0))
  });

  const normalizeRecord = (record: any): PaymentRecord => {
    const cachedBreakdown = readTaxBreakdownCache()[record?.id] || {};
    const databaseSubtotal = normalizeMoneyValue(record?.subtotal);
    const databaseIva = normalizeMoneyValue(record?.iva);
    const databaseReteFuente = normalizeMoneyValue(record?.retefuente);
    const normalizedDocumentNumber =
      typeof record?.numeroDocumento === 'string' && record.numeroDocumento.trim()
        ? record.numeroDocumento
        : cachedBreakdown.numeroDocumento || '';
    const normalizedSubtotal =
      Number(databaseSubtotal || 0) > 0 ? databaseSubtotal : Number(cachedBreakdown.subtotal || 0) > 0 ? cachedBreakdown.subtotal : databaseSubtotal;
    const normalizedIva =
      Number(databaseIva || 0) > 0 ? databaseIva : Number(cachedBreakdown.iva || 0) > 0 ? cachedBreakdown.iva : databaseIva;
    const normalizedReteFuente =
      Number(databaseReteFuente || 0) > 0
        ? databaseReteFuente
        : Number(cachedBreakdown.retefuente || 0) > 0
          ? cachedBreakdown.retefuente
          : databaseReteFuente;
    const normalizedValue = normalizeMoneyValue(record?.valor) || 0;
    const inferredReteFuente =
      Number(normalizedReteFuente || 0) > 0 ||
      Number(normalizedSubtotal || 0) <= 0 ||
      Number(normalizedSubtotal || 0) + Number(normalizedIva || 0) <= normalizedValue
        ? normalizedReteFuente
        : Number(normalizedSubtotal || 0) + Number(normalizedIva || 0) - normalizedValue;
    const repairedSubtotal =
      Number(normalizedSubtotal || 0) > 0 ||
      Number(normalizedIva || 0) > 0 ||
      Number(inferredReteFuente || 0) > 0 ||
      normalizedValue <= 0
        ? normalizedSubtotal
        : normalizedValue;

    return {
      ...record,
      subtotal: repairedSubtotal,
      iva: normalizedIva,
      retefuente: inferredReteFuente,
      fechaPagoReal: typeof record?.fechaPagoReal === 'string' ? record.fechaPagoReal : undefined,
      numeroDocumento: normalizedDocumentNumber,
      valor: normalizedValue
    };
  };

  const mapRecordForDatabase = (record: PaymentRecord) => ({
    ...record,
    subtotal: Number(record.subtotal || 0),
    iva: Number(record.iva || 0),
    retefuente: Number(record.retefuente || 0),
    valor: Number(record.valor || 0)
  });

  const mapRecordForLegacyDatabase = (record: PaymentRecord) => {
    const { subtotal, iva, retefuente, numeroDocumento, ...persistedRecord } = record;
    return persistedRecord;
  };

  const isMissingExtendedRecordSchemaError = (error: any) => {
    const message = `${error?.message || ''}`.toLowerCase();
    return (
      error?.code === 'PGRST204' &&
      (message.includes("'subtotal' column") ||
        message.includes("'iva' column") ||
        message.includes("'retefuente' column") ||
        message.includes("'numerodocumento' column"))
    );
  };

  const findDuplicateRecord = (record: PaymentRecord, candidateRecords = records) => {
    const current = getDuplicateSignature(record);

    if (!current.providerName || !current.identification) return undefined;

    return candidateRecords.find((existingRecord) => {
      if (existingRecord.id === record.id) return false;

      const existing = getDuplicateSignature(existingRecord);
      const sameProvider =
        existing.providerName === current.providerName &&
        existing.identification === current.identification;

      if (!sameProvider) return false;

      if (current.documentNumber && existing.documentNumber) {
        return existing.documentNumber === current.documentNumber;
      }

      return (
        existing.documentDate === current.documentDate &&
        existing.category === current.category &&
        existing.value === current.value
      );
    });
  };

  const fetchCurrentRecordsForValidation = async () => {
    const { data, error } = await supabase
      .from('payment_records')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error && error.code !== 'PGRST204') throw error;
    return (data || []).map(normalizeRecord);
  };

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

      setRecords((recordsData || []).map(normalizeRecord));
      setProviders((providersData || []).map(normalizeProvider));
    } catch (error: any) {
      console.error('Error fetching data:', error);
      showNotification(`Error de conexion: ${error.message}`, 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const login = (username: string, password: string): boolean => {
    const matchedUser = APP_USERS.find(
      (user) => user.username.toLowerCase() === username.trim().toLowerCase() && user.password === password
    );

    if (!matchedUser) return false;

    setCurrentUser(matchedUser);
    setCurrentView(getDefaultView(matchedUser));
    setEditingRecord(null);
    showNotification(`Bienvenido, ${matchedUser.displayName}.`, 'success');
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
    setEditingRecord(null);
    setNotification(null);
  };

  const handleViewChange = (view: ViewType) => {
    if (!currentUser) return;

    if (!currentUser.permissions.views.includes(view)) {
      showNotification('Este usuario no tiene permiso para acceder a esa seccion.', 'warning');
      return;
    }

    if (view !== 'form') {
      setEditingRecord(null);
    }

    setCurrentView(view);
  };

  const sendEmailNotification = async (record: PaymentRecord, provider: Provider) => {
    const configuredRecipients = adminEmail
      .split(/[;,]/)
      .map((email) => email.trim())
      .filter((email) => email.includes('@') && email.includes('.'));

    const recipients = Array.from(
      new Set(
        [...configuredRecipients, ...REQUIRED_NOTIFICATION_EMAILS].map((email) => email.trim().toLowerCase()).filter(Boolean)
      )
    );

    if (recipients.length === 0) {
      showNotification('Configure al menos un correo valido en la barra lateral.', 'warning');
      return;
    }

    try {
      for (const recipient of recipients) {
        const { data, error } = await invokeEmailFunction({
          record,
          provider,
          to: recipient
        });

        if (error) {
          const status = (error as any).status || (error as any).context?.status;
          const message = (data as any)?.error || error.message;
          if (status === 401) {
            showNotification('ERROR: Falta RESEND_API_KEY en Supabase.', 'warning');
          } else if (status === 404) {
            showNotification('No existe la funcion de correo en Supabase. Despliegue resend-email o send-payment-email.', 'warning');
          } else {
            showNotification(`Falla en notificacion (${recipient}): ${message}`, 'warning');
          }
          return;
        }
      }

      showNotification('Notificacion enviada con exito.', 'success');
    } catch (error: any) {
      showNotification('Error de red al enviar la notificacion.', 'warning');
    }
  };

  const handleResendEmail = async (record: PaymentRecord) => {
    const provider = providers.find((item) => item.identificacion === record.identificacion);
    if (!provider) {
      showNotification('No se encontro el proveedor.', 'warning');
      return;
    }

    showNotification('Reenviando correo...', 'info');
    await sendEmailNotification(record, provider);
  };

  const handleSubmission = async (data: { record: PaymentRecord; provider: Provider }) => {
    const { provider } = data;
    const record = currentUser?.permissions.canManagePaymentStatus
      ? data.record
      : {
          ...data.record,
          estado: editingRecord?.estado || PaymentStatus.Radicado,
          comprobantePago: editingRecord?.comprobantePago || data.record.comprobantePago,
          comprobanteFile: editingRecord?.comprobanteFile || data.record.comprobanteFile,
          motivoDevolucion: editingRecord?.motivoDevolucion || data.record.motivoDevolucion,
          fechaPagoReal: editingRecord?.fechaPagoReal || data.record.fechaPagoReal
        };
    const isNew = !editingRecord;

    try {
      const currentRecords = await fetchCurrentRecordsForValidation();
      const validationRecords = currentRecords.length > 0 ? currentRecords : records;
      const duplicateRecord = findDuplicateRecord(record, validationRecords);
      if (duplicateRecord) {
        const message = `Documento duplicado favor validar. Ya existe en el radicado ${duplicateRecord.radicado}.`;
        window.alert(message);
        showNotification(message, 'warning');
        return;
      }

      const { error: providerError } = await supabase.from('providers').upsert(provider);
      if (providerError) throw providerError;

      cacheTaxBreakdown(record);

      const { error: recordError } = await supabase.from('payment_records').upsert(mapRecordForDatabase(record));
      if (recordError) {
        if (!isMissingExtendedRecordSchemaError(recordError)) throw recordError;

        const { error: legacyRecordError } = await supabase.from('payment_records').upsert(mapRecordForLegacyDatabase(record));
        if (legacyRecordError) throw legacyRecordError;

        showNotification(
          'Guardado con esquema anterior. Faltan columnas nuevas en Supabase; aplica las migraciones para conservar todos los datos.',
          'warning'
        );
      }

      await fetchData();

      if (isNew) {
        showNotification(`Radicado ${record.radicado} guardado.`, 'success');
        showNotification('Enviando notificacion por correo...', 'info');
        await sendEmailNotification(record, provider);
      } else {
        setEditingRecord(null);
        showNotification('Cambios guardados.', 'info');
      }

      setCurrentView('table');
    } catch (error: any) {
      showNotification(`Error al guardar: ${error.message}`, 'warning');
    }
  };

  const handleProvidersUpdate = async (updatedProviders: Provider[]) => {
    try {
      const { error } = await supabase.from('providers').upsert(updatedProviders);
      if (error) throw error;
      setProviders(updatedProviders);
      showNotification('Directorio actualizado.', 'success');
    } catch (error: any) {
      showNotification(`Error al actualizar directorio: ${error.message}`, 'warning');
    }
  };

  const deleteProvider = async (identificacion: string) => {
    if (window.confirm('Desea eliminar este proveedor? Esto no borrara sus radicados existentes.')) {
      setLoading(true);
      try {
        const { error } = await supabase.from('providers').delete().eq('identificacion', identificacion);
        if (error) throw error;
        setProviders((prev) => prev.filter((provider) => provider.identificacion !== identificacion));
        showNotification('Proveedor eliminado correctamente.', 'success');
      } catch (error: any) {
        showNotification('Error: No se pudo eliminar.', 'warning');
      } finally {
        setLoading(false);
      }
    }
  };

  const updateStatus = async (
    id: string,
    newStatus: PaymentStatus,
    extra?: { comprobante?: string; motivo?: string; comprobanteFile?: SupportFile; fechaPagoReal?: string }
  ) => {
    if (!currentUser?.permissions.canManagePaymentStatus) {
      showNotification('Contabilidad no puede gestionar estados de pago o devolucion.', 'warning');
      return;
    }

    try {
      const updates: any = {
        estado: newStatus,
        comprobantePago: extra?.comprobante,
        motivoDevolucion: extra?.motivo,
        fechaPagoReal: extra?.fechaPagoReal
      };
      if (extra?.comprobanteFile) updates.comprobanteFile = extra.comprobanteFile;

      const { error } = await supabase.from('payment_records').update(updates).eq('id', id);
      if (error) {
        const message = `${error?.message || ''}`.toLowerCase();
        if (!(error?.code === 'PGRST204' && message.includes("'fechapagoreal' column"))) throw error;

        const { fechaPagoReal, ...legacyUpdates } = updates;
        const { error: legacyError } = await supabase.from('payment_records').update(legacyUpdates).eq('id', id);
        if (legacyError) throw legacyError;
      }

      setRecords((prev) => prev.map((record) => (record.id === id ? { ...record, ...updates } : record)));
      showNotification('Estado actualizado.', 'success');
    } catch (error: any) {
      showNotification('Error al actualizar el estado.', 'info');
    }
  };

  const deleteRecord = async (id: string) => {
    if (window.confirm('Desea eliminar este radicado definitivamente?')) {
      try {
        const { error } = await supabase.from('payment_records').delete().eq('id', id);
        if (error) throw error;
        setRecords((prev) => prev.filter((record) => record.id !== id));
        showNotification('Radicado eliminado.', 'info');
      } catch (error) {
        showNotification('No se pudo eliminar el registro.', 'info');
      }
    }
  };

  if (!currentUser) {
    return <LoginScreen users={APP_USERS} onLogin={login} />;
  }

  return (
    <Layout
      currentView={currentView}
      availableViews={availableViews}
      currentUser={currentUser}
      onViewChange={handleViewChange}
      onLogout={logout}
      adminEmail={adminEmail}
      onAdminEmailChange={setAdminEmail}
    >
      {notification && (
        <div
          className={`fixed top-6 right-6 z-[300] flex max-w-md items-center space-x-4 rounded-2xl border-l-8 p-6 shadow-2xl transition-all duration-500 animate-in slide-in-from-right-full ${
            notification.type === 'success'
              ? 'border-green-600 bg-green-50 text-green-900'
              : notification.type === 'warning'
                ? 'border-red-600 bg-red-50 text-red-900'
                : 'border-blue-600 bg-blue-50 text-blue-900'
          }`}
        >
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-bold text-white shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-600'
                : notification.type === 'warning'
                  ? 'bg-red-600'
                  : 'bg-blue-600'
            }`}
          >
            {notification.type === 'success' ? 'OK' : notification.type === 'warning' ? '!' : 'i'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-black uppercase leading-tight tracking-tight">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="text-xl font-bold text-slate-400 hover:text-slate-600">
            x
          </button>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
            <p className="font-bold text-indigo-800 animate-pulse">Sincronizando...</p>
          </div>
        </div>
      )}

      {currentView === 'dashboard' && <Dashboard records={records} onAddClick={() => handleViewChange('form')} />}

      {currentView === 'form' && (
        <PaymentForm
          onSubmit={handleSubmission}
          onCancel={() => {
            setEditingRecord(null);
            handleViewChange('table');
          }}
          initialData={editingRecord}
          nextRadicado={
            records.length > 0
              ? (Math.max(
                  ...records.map((record) => {
                    const num = parseInt(record.radicado.replace('RAD-', ''));
                    return isNaN(num) ? 0 : num;
                  })
                ) + 1)
                  .toString()
                  .padStart(4, '0')
              : '0001'
          }
          providers={providers}
          canManagePaymentStatus={currentUser.permissions.canManagePaymentStatus}
        />
      )}

      {currentView === 'table' && (
        <PaymentTable
          records={records}
          providers={providers}
          onEdit={(record) => {
            setEditingRecord(record);
            handleViewChange('form');
          }}
          onDelete={deleteRecord}
          onStatusChange={updateStatus}
          onResendEmail={handleResendEmail}
          canManagePaymentStatus={currentUser.permissions.canManagePaymentStatus}
        />
      )}

      {currentView === 'directory' && (
        <ProviderDirectory providers={providers} onUpdate={handleProvidersUpdate} onDelete={deleteProvider} />
      )}
    </Layout>
  );
};

export default App;
