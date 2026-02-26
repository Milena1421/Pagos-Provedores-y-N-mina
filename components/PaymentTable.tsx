
import React, { useState, useMemo } from 'react';
import { PaymentRecord, PaymentStatus, Category, SupportFile, DocumentType, Provider } from '../types';
import { supabase } from '../App';

interface PaymentTableProps {
  records: PaymentRecord[];
  providers: Provider[];
  onEdit: (record: PaymentRecord) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: PaymentStatus, extra?: { comprobante?: string, motivo?: string, comprobanteFile?: SupportFile }) => void;
  onResendEmail: (record: PaymentRecord) => void;
}

export const PaymentTable: React.FC<PaymentTableProps> = ({ records, providers, onEdit, onDelete, onStatusChange, onResendEmail }) => {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(PaymentStatus.Radicado);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingSupports, setViewingSupports] = useState<{title: string, files: SupportFile[]} | null>(null);

  const [pendingAction, setPendingAction] = useState<{id: string, status: PaymentStatus} | null>(null);
  const [tempMotivo, setTempMotivo] = useState('');
  const [tempComprobante, setTempComprobante] = useState('');
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
        r.identificacion.toLowerCase().includes(filter.toLowerCase());
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

  const formatDatePAB = (dateStr: string): string => {
    const date = dateStr ? new Date(dateStr) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  const exportPAB = () => {
    const selectedRecords = records.filter(r => selectedIds.has(r.id));
    if (selectedRecords.length === 0) return;

    const currentMonth = new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase();

    // BLOQUE 1: ENCABEZADO DE CONTROL
    const headerControlTitles = [
      'NIT PAGADOR', 'TIPO DE PAGO', 'APLICACION', 'SECUENCIA DE ENVIO', 
      'NRO CUENTA A DEBITAR', 'TIPO DE CUENTA A DEBITAR', 'DESCRIPCION DEL PAGO'
    ].join(';');

    const headerControlData = [
      '901290421', '225', 'I', 'A1', '500035919', 'S', `Nomina${currentMonth.slice(0,3)}`
    ].join(';');

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
    ].join(';');

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
        `PAGO_${r.radicado}`,
        p?.telefono || '0000000000',
        formatCurrencyPAB(r.valor),
        formatDatePAB(r.fechaPago || r.fechaDocumento)
      ].join(';');
    });

    const csvContent = [
      headerControlTitles,
      headerControlData,
      detailTitles,
      ...detailRows
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Pago_Nomina_${currentMonth}_${new Date().getFullYear()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const uploadComprobante = async (file: File): Promise<SupportFile> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `comprobantes/${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('payments').upload(fileName, file);
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
        comprobanteFile: uploadedFile
      });
      setPendingAction(null);
      setTempMotivo('');
      setTempComprobante('');
      setTempFile(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const StatusBadge = ({ status }: { status: PaymentStatus }) => {
    const colors = {
      [PaymentStatus.Radicado]: 'bg-blue-100 text-blue-700',
      [PaymentStatus.Pagado]: 'bg-green-100 text-green-700',
      [PaymentStatus.Devuelto]: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${colors[status]}`}>{status}</span>;
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

      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-center shadow-sm">
        <div className="relative flex-1 w-full">
          <span className="absolute left-4 top-2.5 text-slate-400">🔍</span>
          <input 
            type="text" 
            placeholder="Buscar por radicado, proveedor o identificacion..." 
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
          />
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado:</label>
          <select 
            className="flex-1 md:w-56 px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none font-black text-slate-700 focus:ring-4 focus:ring-indigo-100 transition-all"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="todos">HISTORIAL COMPLETO</option>
            {Object.values(PaymentStatus).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
               {statusFilter === 'todos' ? 'Base de Datos Maestra' : `Vista de Filtro: ${statusFilter}`}
             </p>
          </div>
          <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">{filteredRecords.length} Radicados</span>
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
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Control</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mes / Fecha</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Bruto</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Gestion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 transition-all group ${selectedIds.has(r.id) ? 'bg-indigo-50/80' : ''}`}>
                  <td className="px-6 py-6">
                    <div className="flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow-sm transition-transform active:scale-90"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="font-mono text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">{r.radicado}</span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="text-xs font-black text-slate-900 uppercase tracking-tight">{r.mesContable}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">Exp: {r.fechaDocumento}</div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="text-xs font-black text-slate-900 uppercase truncate max-w-[220px] tracking-tight">{r.proveedor}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1 font-bold">{r.identificacion} • {r.categoria}</div>
                  </td>
                  <td className="px-6 py-6 text-right">
                    <span className="text-sm font-black text-slate-900 tracking-tighter">${r.valor.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-6 text-center">
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
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90">
                        <button onClick={() => onStatusChange(r.id, PaymentStatus.Radicado)} className="w-7 h-7 rounded-xl border-2 border-blue-600 text-[10px] font-black text-blue-600 hover:bg-blue-600 hover:text-white transition-all">R</button>
                        <button onClick={() => setPendingAction({id: r.id, status: PaymentStatus.Pagado})} className="w-7 h-7 rounded-xl border-2 border-emerald-600 text-[10px] font-black text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all">P</button>
                        <button onClick={() => setPendingAction({id: r.id, status: PaymentStatus.Devuelto})} className="w-7 h-7 rounded-xl border-2 border-rose-600 text-[10px] font-black text-rose-600 hover:bg-rose-600 hover:text-white transition-all">D</button>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button onClick={() => onResendEmail(r)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-indigo-100 transition-all" title="Notificar">✉️</button>
                      {r.supports.length > 0 && <button onClick={() => setViewingSupports({title: 'Expediente de Radicacion', files: r.supports})} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-blue-100 transition-all">📎</button>}
                      <div className="w-px h-5 bg-slate-200 mx-1"></div>
                      <button onClick={() => onEdit(r)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-amber-100 transition-all">✏️</button>
                      <button onClick={() => onDelete(r.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-rose-100 transition-all">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
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
                <button onClick={() => { setPendingAction(null); setTempFile(null); setTempMotivo(''); setTempComprobante(''); }} className="flex-1 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Abortar</button>
                <button onClick={confirmChange} disabled={isUploading} className={`flex-1 py-5 text-[10px] font-black text-white rounded-2xl shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 ${pendingAction.status === PaymentStatus.Pagado ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'} uppercase tracking-widest`}>
                  {isUploading ? 'Procesando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingSupports && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-lg p-6">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50/80">
              <div>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mb-1 italic">Archivo Central de Tesoreria</p>
                <h3 className="font-black text-slate-900 text-xl uppercase tracking-tighter">📂 {viewingSupports.title}</h3>
              </div>
              <button onClick={() => setViewingSupports(null)} className="w-12 h-12 rounded-2xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-all text-3xl font-light">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-100/50">
              {viewingSupports.files.map(file => (
                <div key={file.id} className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col hover:scale-[1.02] transition-transform duration-500">
                  <div className="p-6 flex items-center justify-between border-b bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-700 uppercase truncate flex-1 tracking-widest pr-4">{file.name}</span>
                    <a href={file.data} target="_blank" rel="noreferrer" className="text-[10px] bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black hover:bg-indigo-600 transition-all uppercase tracking-widest shadow-lg">Descargar</a>
                  </div>
                  <div className="flex-1 min-h-[500px] flex items-center justify-center bg-slate-200/30 p-8">
                    {file.type.includes('image') ? <img src={file.data} alt={file.name} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" /> : <iframe src={file.data} className="w-full h-full border-0 rounded-xl shadow-2xl bg-white" title={file.name} />}
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
