
import React, { useEffect, useMemo, useState } from 'react';
import { PaymentRecord, PaymentStatus, Category, SupportFile, DocumentType, Provider } from '../types';
import { supabase } from '../App';

interface PaymentTableProps {
  records: PaymentRecord[];
  providers: Provider[];
  onEdit: (record: PaymentRecord) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: PaymentStatus, extra?: { comprobante?: string, motivo?: string, comprobanteFile?: SupportFile, fechaPagoReal?: string }) => void;
  onResendEmail: (record: PaymentRecord) => void;
  canManagePaymentStatus: boolean;
}

export const PaymentTable: React.FC<PaymentTableProps> = ({ records, providers, onEdit, onDelete, onStatusChange, onResendEmail, canManagePaymentStatus }) => {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(PaymentStatus.Radicado);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingSupports, setViewingSupports] = useState<{title: string, files: SupportFile[]} | null>(null);
  const [activeSupportIndex, setActiveSupportIndex] = useState(0);

  const [pendingAction, setPendingAction] = useState<{id: string, status: PaymentStatus} | null>(null);
  const [tempMotivo, setTempMotivo] = useState('');
  const [tempComprobante, setTempComprobante] = useState('');
  const [tempFechaPago, setTempFechaPago] = useState(() => new Date().toISOString().split('T')[0]);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Mapeo Maestro de Bancos (según imagen proporcionada)
  const BANK_CODES: Record<string, string> = {
    'BANCO DE BOGOTA': '1001',
    'BANCO POPULAR': '1002',
    'ITAU ANTES CORPBANCA': '1006',
    'BANCOLOMBIA': '1007',
    'CITIBANK': '1009',
    'BANCO GNB SUDAMERIS': '1012',
    'BBVA COLOMBIA': '1013',
    'ITAU': '1014',
    'DAVIBANK S.A': '1019',
    'BANCO DE OCCIDENTE': '1023',
    'BANCOLDEX S.A.': '1031',
    'BANCO CAJA SOCIAL BCSC SA': '1032',
    'BANCO AGRARIO': '1040',
    'BANCO MUNDO MUJER': '1047',
    'BANCO DAVIVIENDA SA': '1051',
    'BANCO AV VILLAS': '1052',
    'BANCO W': '1053',
    'BANCO DE LAS MICROFINANZAS - BANCAMIA S.A.': '1059',
    'BANCO PICHINCHA': '1060',
    'BANCOOMEVA': '1061',
    'BANCO FALABELLA S.A.': '1062',
    'BANCO FINANDINA S.A.': '1063',
    'BANCO SANTANDER DE NEGOCIOS COLOMBIA S.A': '1065',
    'BANCO COOPERATIVO COOPCENTRAL': '1066',
    'MIBANCO S.A.': '1067',
    'BANCO SERFINANZA S.A': '1069',
    'LULO BANK S.A.': '1070',
    'BANCO J.P. MORGAN COLOMBIA S.A.': '1071',
    'ASOPAGOS S.A.S': '1086',
    'FINANCIERA JURISCOOP S.A. COMPAÑIA DE FINANCIERA': '1121',
    'COOPERATIVA FINANCIERA DE ANTIOQUIA': '1283',
    'PIBANK': '1560',
    'JFK COOPERATIVA FINANCIERA': '1286',
    'COOTRAFA COOPERATIVA FINANCIERA': '1289',
    'CONFIAR COOPERATIVA FINANCIERA': '1292',
    'BANCO UNION S.A': '1303',
    'COLTEFINANCIERA S.A': '1370',
    'NEQUI': '1507',
    'DAVIPLATA': '1551',
    'BAN100 S.A': '1558',
    'IRIS': '1637',
    'MOVII': '1801',
    'DING TECNIPAGOS SA': '1802',
    'UALA': '1804',
    'BANCO BTG PACTUAL': '1805',
    'POWWI': '1803',
    'BOLD CF': '1808',
    'NU': '1809',
    'RAPPIPAY': '1811',
    'COINK': '1812',
    'GLOBAL66': '1814',
    'BANCO CONTACTAR S.A.': '1819',
    'AVAL SOLUCIONES DIGITALES S.A.': '1899',
    'CREZCAMOS S.A. COMPAÑIA DE FINANCIAMIENTO': '1816'
  };

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = 
        r.proveedor.toLowerCase().includes(filter.toLowerCase()) || 
        r.radicado.toLowerCase().includes(filter.toLowerCase()) ||
        r.identificacion.toLowerCase().includes(filter.toLowerCase()) ||
        (r.numeroDocumento || '').toLowerCase().includes(filter.toLowerCase());
      const matchesStatus = statusFilter === 'todos' || r.estado === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [records, filter, statusFilter]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const mapDocumentType = (type: string): string => {
    switch (type) {
      case DocumentType.CC: return '1';
      case DocumentType.CE: return '2';
      case DocumentType.NIT: return '3';
      case DocumentType.TI: return '4';
      case DocumentType.PA: return '5';
      default: return '1';
    }
  };

  const mapBankCode = (bankName: string): string => {
    if (!bankName) return '1007'; // Por defecto Bancolombia
    const normalized = bankName.toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
      .trim();
    
    // Buscar coincidencia exacta o que contenga el nombre
    const foundCode = BANK_CODES[normalized];
    if (foundCode) return foundCode;

    // Búsqueda parcial si no hay exacta
    const entry = Object.entries(BANK_CODES).find(([name]) => normalized.includes(name) || name.includes(normalized));
    return entry ? entry[1] : '1007';
  };

  const formatCurrencyPAB = (value: number): string => {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  };

  const formatDisplayCurrency = (value?: number): string => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return 'Sin dato';
    return `$${Number(value).toLocaleString('es-CO')}`;
  };

  const isPaymentOverdue = (record: PaymentRecord): boolean => {
    if (!record.fechaPago || record.estado === PaymentStatus.Pagado) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(`${record.fechaPago}T00:00:00`);
    return dueDate < today;
  };

  const formatDatePAB = (date = new Date()): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  const formatPayrollReference = (date = new Date()): string => {
    const month = date.toLocaleString('es-ES', { month: 'long' });
    const monthFormatted = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
    return `Nomina_${monthFormatted}_${date.getFullYear()}`;
  };

  const escapeXml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const exportPAB = () => {
    const selectedRecords = records.filter(r => selectedIds.has(r.id));
    if (selectedRecords.length === 0) return;

    const currentMonth = new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase();
    const payrollReference = formatPayrollReference();

    // BLOQUE 1: ENCABEZADO DE CONTROL
    const headerControlTitles = [
      'NIT PAGADOR', 'TIPO DE PAGO', 'APLICACION', 'SECUENCIA DE ENVIO', 
      'NRO CUENTA A DEBITAR', 'TIPO DE CUENTA A DEBITAR', 'DESCRIPCION DEL PAGO'
    ];

    const headerControlData = [
      '901290421', '225', 'I', 'A1', '500035919', 'S', payrollReference
    ];

    // BLOQUE 2: DETALLE DE BENEFICIARIOS (Orden exacto según requerimiento y pantallazo)
    const detailTitles = [
      'Tipo Documento Beneficiario',
      'Nit Beneficiario',
      'Nombre Beneficiario',
      'Tipo Transaccion',
      'Codigo Banco',
      'No Cuenta Beneficiario',
      'Email',
      'Documento Autorizado',
      'Referencia',
      'Celular Beneficiario',
      'ValorTransaccion',
      'Fecha de aplicacion'
    ];

    const detailRows = selectedRecords.map(r => {
      const p = providers.find(prov => prov.identificacion.replace(/\D/g, '') === r.identificacion.replace(/\D/g, ''));
      const cleanId = r.identificacion.replace(/\D/g, '');
      
      return [
        mapDocumentType(p?.tipoDocumento || DocumentType.CC),
        cleanId,
        r.proveedor.toUpperCase(),
        '37', // Tipo Transaccion
        mapBankCode(p?.entidadBancaria || ''), // Codigo Banco Maestra
        p?.numeroCuenta || '0000000000',
        p?.correo || 'notificacion@ingenieria365.com',
        cleanId, // Documento Autorizado
        payrollReference,
        p?.telefono || '0000000000',
        formatCurrencyPAB(r.valor),
        formatDatePAB()
      ];
    });

    const rows = [
      headerControlTitles,
      headerControlData,
      detailTitles,
      ...detailRows
    ];

    const xmlRows = rows
      .map((row) => `
        <Row>
          ${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(String(cell ?? ''))}</Data></Cell>`).join('')}
        </Row>`)
      .join('');

    const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="FORMATOPAB">
    <Table>
      ${xmlRows}
    </Table>
  </Worksheet>
</Workbook>`;

    const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Pago_Nomina_${currentMonth}_${new Date().getFullYear()}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const uploadComprobante = async (file: File): Promise<SupportFile> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `comprobantes/${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('payments').upload(fileName, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw new Error(`Error al subir comprobante: ${uploadError.message}`);
    const { data } = supabase.storage.from('payments').getPublicUrl(fileName);
    return { id: crypto.randomUUID(), name: file.name, type: file.type, data: data.publicUrl };
  };

  const confirmChange = async () => {
    if (!pendingAction) return;
    setIsUploading(true);
    try {
      let uploadedFile: SupportFile | undefined = undefined;
      if (tempFile && pendingAction.status === PaymentStatus.Pagado) {
        uploadedFile = await uploadComprobante(tempFile);
      }
      onStatusChange(pendingAction.id, pendingAction.status, {
        comprobante: tempComprobante || undefined,
        motivo: tempMotivo || undefined,
        comprobanteFile: uploadedFile,
        fechaPagoReal: pendingAction.status === PaymentStatus.Pagado ? tempFechaPago : undefined
      });
      setPendingAction(null);
      setTempMotivo('');
      setTempComprobante('');
      setTempFechaPago(new Date().toISOString().split('T')[0]);
      setTempFile(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const getPrimarySupport = (record: PaymentRecord) => {
    if (record.supports.length === 0) return null;
    return record.supports[record.supports.length - 1];
  };

  const getSupportExtension = (file: SupportFile | null) => {
    if (!file?.name) return '';
    return file.name.split('.').pop()?.toUpperCase() || '';
  };

  const isImageSupport = (file: SupportFile | null) => {
    return Boolean(file?.type?.includes('image'));
  };

  useEffect(() => {
    setActiveSupportIndex(0);
  }, [viewingSupports]);

  const getDocumentPreviewUrl = (file: SupportFile) => {
    if (file.type.includes('pdf')) return `${file.data}#zoom=125&view=FitH`;
    return file.data;
  };

  const StatusBadge = ({ status }: { status: PaymentStatus }) => {
    const colors = {
      [PaymentStatus.Radicado]: 'bg-blue-100 text-blue-700',
      [PaymentStatus.Pagado]: 'bg-green-100 text-green-700',
      [PaymentStatus.Devuelto]: 'bg-red-100 text-red-700',
    };
    return <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="space-y-4">
      {selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-8 py-5 rounded-[2.5rem] shadow-2xl border border-slate-700 flex items-center space-x-8 animate-in slide-in-from-bottom-20 duration-500">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-black text-lg border-2 border-indigo-400/30 shadow-lg">
              {selectedIds.size}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Tramites Listos</p>
              <p className="text-xs font-bold text-slate-300">Seleccionados para pago</p>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-700"></div>
          <button 
            onClick={exportPAB}
            className="group flex items-center space-x-3 bg-white text-slate-900 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.1em] hover:bg-emerald-500 hover:text-white transition-all shadow-xl hover:-translate-y-1 active:scale-95"
          >
            <span className="text-xl group-hover:rotate-12 transition-transform">🏦</span>
            <span>Generar Archivo PAB</span>
          </button>
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
          >
            Limpiar Seleccion
          </button>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-center shadow-sm">
        <div className="relative flex-1 w-full">
          <span className="absolute left-4 top-2.5 text-slate-400">🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por radicado, proveedor o identificacion..." 
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl text-base focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
          />
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado:</label>
          <select 
            className="flex-1 md:w-64 px-4 py-3 border border-slate-200 rounded-xl text-base bg-slate-50 outline-none font-black text-slate-700 focus:ring-4 focus:ring-indigo-100 transition-all"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="todos">HISTORIAL COMPLETO</option>
            {Object.values(PaymentStatus).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
             <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
               {statusFilter === 'todos' ? 'Base de Datos Maestra' : `Vista de Filtro: ${statusFilter}`}
             </p>
          </div>
          <span className="text-[11px] text-indigo-400 font-black uppercase tracking-widest">{filteredRecords.length} Radicados</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-5 w-14">
                  <div className="flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                      onChange={toggleSelectAll}
                      className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm"
                    />
                  </div>
                </th>
                <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Control</th>
                <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Mes / Fechas</th>
                <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Valores</th>
                <th className="px-8 py-6 text-xs font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
                <th className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Gestion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map(r => {
                const paymentOverdue = isPaymentOverdue(r);

                return (
                <tr key={r.id} className={`hover:bg-slate-50 transition-all group ${selectedIds.has(r.id) ? 'bg-indigo-50/80' : paymentOverdue ? 'bg-rose-50/70' : ''}`}>
                  <td className="px-8 py-8">
                    <div className="flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm transition-transform active:scale-90"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-8">
                    <span className="font-mono text-sm font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">{r.radicado}</span>
                  </td>
                  <td className="px-8 py-8">
                    <div className="text-base font-black text-slate-900 uppercase tracking-tight">{r.mesContable}</div>
                    <div className="text-sm text-slate-400 font-bold uppercase mt-1">Exp: {r.fechaDocumento}</div>
                    {r.numeroDocumento && (
                      <div className="mt-1 text-sm font-black uppercase text-slate-500">
                        Factura: {r.numeroDocumento}
                      </div>
                    )}
                    {r.estado === PaymentStatus.Pagado ? (
                      <>
                        <div className="text-sm text-indigo-500 font-bold uppercase mt-1">
                          Vencimiento: {r.fechaPago || 'Pendiente'}
                        </div>
                        <div className="text-sm text-emerald-600 font-bold uppercase mt-1">
                          Pagado: {r.fechaPagoReal || 'Sin fecha'}
                        </div>
                      </>
                    ) : (
                      <div className={`text-sm font-bold uppercase mt-1 ${paymentOverdue ? 'text-rose-600' : 'text-indigo-500'}`}>
                        Vencimiento: {r.fechaPago || 'Pendiente'}
                      </div>
                    )}
                    {paymentOverdue && (
                      <div className="mt-2 inline-flex rounded-full bg-rose-600 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-white shadow-sm">
                        Pago vencido
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-8">
                    <div className="max-w-[420px] truncate text-base font-black text-slate-900 uppercase tracking-tight">{r.proveedor}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1 font-bold">{r.identificacion} • {r.categoria}</div>
                  </td>
                  <td className="px-8 py-8 text-right">
                    <div className="ml-auto min-w-[280px] space-y-2">
                      <div className="grid grid-cols-[140px_1fr] items-center gap-4 text-sm font-bold text-slate-400">
                        <span className="text-left uppercase tracking-widest">Subtotal</span>
                        <span className={`font-mono text-right ${r.subtotal === undefined ? 'text-slate-300 italic' : 'text-slate-700'}`}>
                          {formatDisplayCurrency(r.subtotal)}
                        </span>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] items-center gap-4 text-sm font-bold text-slate-400">
                        <span className="text-left uppercase tracking-widest">IVA</span>
                        <span className={`font-mono text-right ${r.iva === undefined ? 'text-slate-300 italic' : 'text-slate-700'}`}>
                          {formatDisplayCurrency(r.iva)}
                        </span>
                      </div>
                      <div className="grid grid-cols-[140px_1fr] items-center gap-4 text-sm font-bold text-rose-500">
                        <span className="text-left uppercase tracking-widest">Retefuente</span>
                        <span className={`font-mono text-right ${r.retefuente === undefined ? 'text-slate-300 italic' : ''}`}>
                          {r.retefuente === undefined ? 'Sin dato' : `-${formatDisplayCurrency(r.retefuente)}`}
                        </span>
                      </div>
                      <div className="pt-1 text-2xl font-black text-slate-900 tracking-tighter">
                        {formatDisplayCurrency(r.valor)}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-8 text-center">
                    <div className="flex flex-col items-center space-y-2">
                      <StatusBadge status={r.estado} />
                      <div className="flex items-center space-x-1">
                        {r.comprobantePago && (
                          <div className="text-[9px] text-emerald-600 font-black bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 truncate max-w-[100px]" title={r.comprobantePago}>
                            {r.comprobantePago}
                          </div>
                        )}
                        {r.comprobanteFile && (
                          <button 
                            onClick={() => setViewingSupports({ title: 'Comprobante de Pago', files: [r.comprobanteFile!] })}
                            className="w-6 h-6 flex items-center justify-center bg-slate-900 text-white rounded-full text-[10px] shadow-lg hover:scale-110 transition-transform"
                          >📄</button>
                        )}
                      </div>
                      {canManagePaymentStatus && (
                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90">
                          <button onClick={() => onStatusChange(r.id, PaymentStatus.Radicado)} className="w-7 h-7 rounded-xl border-2 border-blue-600 text-[10px] font-black text-blue-600 hover:bg-blue-600 hover:text-white transition-all">R</button>
                          <button onClick={() => { setTempFechaPago(new Date().toISOString().split('T')[0]); setPendingAction({id: r.id, status: PaymentStatus.Pagado}); }} className="w-7 h-7 rounded-xl border-2 border-emerald-600 text-[10px] font-black text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all">P</button>
                          <button onClick={() => setPendingAction({id: r.id, status: PaymentStatus.Devuelto})} className="w-7 h-7 rounded-xl border-2 border-rose-600 text-[10px] font-black text-rose-600 hover:bg-rose-600 hover:text-white transition-all">D</button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => onResendEmail(r)}
                        className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-slate-200 bg-white text-lg text-slate-400 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:text-indigo-600 hover:shadow-lg"
                        title="Notificar"
                      >
                        ✉️
                      </button>
                      {r.supports.length > 0 && (
                        <button
                          onClick={() => setViewingSupports({ title: 'Expediente de Radicacion', files: r.supports })}
                          className="group relative h-12 w-12 overflow-hidden rounded-[1rem] border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                          title={getPrimarySupport(r)?.name || 'Documento cargado'}
                        >
                          {isImageSupport(getPrimarySupport(r)) ? (
                            <img
                              src={getPrimarySupport(r)!.data}
                              alt={getPrimarySupport(r)!.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
                              <div className="absolute right-1.5 bottom-1.5 rounded-md bg-rose-500 px-1 py-0.5 text-[7px] font-black uppercase tracking-widest text-white shadow-sm">
                                {getSupportExtension(getPrimarySupport(r)) || 'DOC'}
                              </div>
                              <div className="absolute inset-x-1.5 bottom-1.5 truncate text-left text-[6px] font-black uppercase tracking-[0.18em] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                                Ver
                              </div>
                            </div>
                          )}
                        </button>
                      )}
                      <div className="w-px h-5 bg-slate-200 mx-1"></div>
                      <button onClick={() => onEdit(r)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-amber-100 transition-all">✏️</button>
                      <button onClick={() => onDelete(r.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-rose-100 transition-all">🗑️</button>
                    </div>
                  </td>
                </tr>
              );
              })}
              {filteredRecords.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-28 text-center text-slate-400 italic font-bold uppercase text-[10px] tracking-[0.3em]">Boveda de registros vacia</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
            <div className={`p-10 text-white ${pendingAction.status === PaymentStatus.Pagado ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-2">Confirmacion de Accion</p>
              <h3 className="text-2xl font-black uppercase tracking-tighter">{pendingAction.status === PaymentStatus.Pagado ? 'Cerrar con Pago ✅' : 'Registrar Devolucion ⚠️'}</h3>
            </div>
            <div className="p-10 space-y-6">
              {pendingAction.status === PaymentStatus.Pagado ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Referencia Bancaria</label>
                    <input 
                      type="text" 
                      value={tempComprobante}
                      onChange={e => setTempComprobante(e.target.value)}
                      className="w-full border-2 border-slate-100 rounded-2xl p-5 text-sm font-black outline-none focus:border-emerald-500 focus:bg-emerald-50/30 transition-all"
                      placeholder="N° Transaccion o Referencia"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Fecha de Pago</label>
                    <input
                      type="date"
                      value={tempFechaPago}
                      onChange={e => setTempFechaPago(e.target.value)}
                      className="w-full border-2 border-slate-100 rounded-2xl p-5 text-sm font-black outline-none focus:border-emerald-500 focus:bg-emerald-50/30 transition-all"
                      required
                    />
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border-2 border-dashed border-slate-200 relative group cursor-pointer hover:bg-emerald-50 hover:border-emerald-200 transition-all text-center">
                    <label className="cursor-pointer block">
                      <span className="text-4xl mb-2 block group-hover:scale-110 transition-transform">📁</span>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed block">{tempFile ? tempFile.name : 'Vincular Comprobante de Pago (PDF/IMG)'}</span>
                      <input type="file" className="hidden" accept="application/pdf,image/*" onChange={e => setTempFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Motivo del Rechazo</label>
                  <textarea 
                    value={tempMotivo}
                    onChange={e => setTempMotivo(e.target.value)}
                    className="w-full border-2 border-slate-100 rounded-2xl p-5 text-sm font-bold outline-none focus:border-rose-500 focus:bg-rose-50/30 h-40 transition-all"
                    placeholder="Describe detalladamente por que se devuelve el tramite..."
                  />
                </div>
              )}
              <div className="flex gap-4 pt-6">
                <button onClick={() => { setPendingAction(null); setTempFile(null); setTempMotivo(''); setTempComprobante(''); setTempFechaPago(new Date().toISOString().split('T')[0]); }} className="flex-1 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Abortar</button>
                <button onClick={confirmChange} disabled={isUploading} className={`flex-1 py-5 text-[10px] font-black text-white rounded-2xl shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 ${pendingAction.status === PaymentStatus.Pagado ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'} uppercase tracking-widest`}>
                  {isUploading ? 'Procesando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingSupports && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-lg p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl h-[96vh] w-full max-w-[98vw] flex flex-col overflow-hidden border border-slate-200">
            <div className="shrink-0 p-6 border-b flex justify-between items-center bg-slate-50/80">
              <div>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-1 italic">Archivo Central de Tesoreria</p>
                <h3 className="font-black text-slate-900 text-xl uppercase tracking-tighter">📂 {viewingSupports.title}</h3>
              </div>
              <button onClick={() => setViewingSupports(null)} className="w-12 h-12 rounded-2xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-all text-3xl font-light">×</button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col bg-slate-100/50 p-5">
              {viewingSupports.files.length > 1 && (
                <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setActiveSupportIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={activeSupportIndex === 0}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Documento</p>
                    <p className="text-sm font-black text-slate-900">
                      {activeSupportIndex + 1} de {viewingSupports.files.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSupportIndex((prev) => Math.min(prev + 1, viewingSupports.files.length - 1))}
                    disabled={activeSupportIndex === viewingSupports.files.length - 1}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 transition-all hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              )}
              {viewingSupports.files.slice(activeSupportIndex, activeSupportIndex + 1).map(file => (
                <div key={file.id} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
                  <div className="shrink-0 p-5 flex items-center justify-between border-b bg-slate-50/50">
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="mb-1 text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Documento Cargado</p>
                      <span className="block truncate text-[10px] font-black text-slate-700 uppercase tracking-widest">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-700 md:inline-flex">
                        Original sin compresion
                      </span>
                      <a href={file.data} target="_blank" rel="noreferrer" className="text-[10px] bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black hover:bg-indigo-600 transition-all uppercase tracking-widest shadow-lg">Abrir original</a>
                      <a href={file.data} download={file.name} className="text-[10px] bg-white text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl font-black hover:border-indigo-200 hover:text-indigo-600 transition-all uppercase tracking-widest shadow-sm">Descargar</a>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-200/30 p-3">
                    {file.type.includes('image') ? (
                      <img src={file.data} alt={file.name} className="h-full w-full object-contain rounded-xl shadow-2xl" />
                    ) : (
                      <iframe src={getDocumentPreviewUrl(file)} className="h-full w-full border-0 rounded-xl bg-white shadow-2xl" title={file.name} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
