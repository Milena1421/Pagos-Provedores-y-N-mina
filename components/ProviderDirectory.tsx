
import React, { useState } from 'react';
import { Provider, DocumentType, BankAccountType } from '../types';

interface ProviderDirectoryProps {
  providers: Provider[];
  onUpdate: (providers: Provider[]) => void;
  onDelete: (identificacion: string) => void;
}

export const ProviderDirectory: React.FC<ProviderDirectoryProps> = ({ providers, onUpdate, onDelete }) => {
  const [formData, setFormData] = useState<Partial<Provider>>({
    tipoDocumento: DocumentType.NIT,
    tipoCuenta: BankAccountType.Ahorros,
    entidadBancaria: '',
    numeroCuenta: '',
    correo: '',
    direccion: '',
    telefono: ''
  });
  
  const [search, setSearch] = useState('');
  const [viewingProvider, setViewingProvider] = useState<Provider | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const cleanId = (id: string) => {
    return id.toString().trim().replace(/\./g, '').replace(/[^0-9\-]/g, '');
  };

  const getNumericId = (id: string) => id.toString().replace(/\D/g, '');

  const standardizeText = (text: string) => {
    if (!text) return '';
    return text.toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .trim()
      .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
      .replace(/[^\w\s.&-]/g, '')
      .replace(/\s+/g, ' ');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: name === 'identificacion' ? cleanId(value) : value 
    }));
  };

  const resetForm = () => {
    setFormData({
      tipoDocumento: DocumentType.NIT,
      tipoCuenta: BankAccountType.Ahorros,
      entidadBancaria: '',
      numeroCuenta: '',
      correo: '',
      direccion: '',
      telefono: '',
      identificacion: '',
      nombre: ''
    });
    setEditingId(null);
  };

  const handleEditClick = (provider: Provider) => {
    setFormData(provider);
    setEditingId(provider.identificacion);
    const formElement = document.getElementById('provider-form');
    formElement?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sId = cleanId(formData.identificacion || '');
    const sName = standardizeText(formData.nombre || '');
    
    const providerData: Provider = {
      identificacion: sId,
      nombre: sName,
      tipoDocumento: formData.tipoDocumento as DocumentType,
      correo: formData.correo?.trim() || '',
      direccion: formData.direccion?.trim() || '',
      telefono: formData.telefono?.trim() || '',
      entidadBancaria: formData.entidadBancaria?.trim() || '',
      numeroCuenta: formData.numeroCuenta?.trim() || '',
      tipoCuenta: formData.tipoCuenta as BankAccountType,
    };

    if (editingId) {
      onUpdate(providers.map(p => p.identificacion === editingId ? providerData : p));
      alert('Registro actualizado correctamente.');
    } else {
      if (providers.some(p => getNumericId(p.identificacion) === getNumericId(sId))) {
        alert('Este proveedor ya existe en el sistema.');
        return;
      }
      onUpdate([...providers, providerData]);
      alert('Proveedor guardado con éxito.');
    }
    resetForm();
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawContent = event.target?.result as string;
      const lines = rawContent.split(/\r?\n/);
      const extracted: Provider[] = [];

      lines.forEach((line, idx) => {
        if (idx === 0 || !line.trim()) return;
        const rowData = line.match(/(".*?"|[^,;]+)/g);
        if (rowData && rowData.length >= 2) {
          const rawId = cleanId(rowData[0].replace(/^"|"$/g, '').trim());
          const rawName = rowData[1].replace(/^"|"$/g, '').trim();
          
          const col4 = rowData[4]?.replace(/^"|"$/g, '').trim() || '';
          const col5 = rowData[5]?.replace(/^"|"$/g, '').trim() || '';
          
          let finalDireccion = '';
          let finalTelefono = '';

          const isAddress = (val: string) => {
            const upper = val.toUpperCase();
            return upper.includes('CRA') || upper.includes('CL') || upper.includes('CALLE') || 
                   upper.includes('CARRERA') || upper.includes('AVENIDA') || upper.includes('#') || 
                   upper.includes('NO.') || upper.includes('DG') || upper.includes('TV');
          };

          if (isAddress(col4)) {
            finalDireccion = col4;
            finalTelefono = col5;
          } else if (isAddress(col5)) {
            finalDireccion = col5;
            finalTelefono = col4;
          } else {
            finalDireccion = col4;
            finalTelefono = col5;
          }

          extracted.push({
            identificacion: rawId,
            nombre: standardizeText(rawName),
            tipoDocumento: (rowData[2]?.replace(/^"|"$/g, '').trim() as DocumentType) || DocumentType.NIT,
            correo: rowData[3]?.replace(/^"|"$/g, '').trim() || '',
            direccion: finalDireccion,
            telefono: finalTelefono,
            entidadBancaria: rowData[6]?.replace(/^"|"$/g, '').trim() || '',
            numeroCuenta: rowData[7]?.replace(/^"|"$/g, '').trim() || '',
            tipoCuenta: (rowData[8]?.replace(/^"|"$/g, '').trim() as BankAccountType) || BankAccountType.Ahorros,
          });
        }
      });

      if (extracted.length > 0) {
        const currentMap = new Map(providers.map(p => [getNumericId(p.identificacion), p]));
        extracted.forEach(p => currentMap.set(getNumericId(p.identificacion), p));
        onUpdate(Array.from(currentMap.values()));
        alert(`Sincronización completa: ${extracted.length} registros procesados.`);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const filteredProviders = providers.filter(p => 
    standardizeText(p.nombre).includes(standardizeText(search)) || p.identificacion.includes(search)
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulario Lateral */}
        <div id="provider-form" className={`lg:col-span-4 bg-white p-6 rounded-2xl border ${editingId ? 'border-indigo-300 ring-4 ring-indigo-50' : 'border-slate-200'} shadow-sm h-fit sticky top-6 transition-all duration-300`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
               <div className={`w-10 h-10 ${editingId ? 'bg-indigo-600' : 'bg-slate-800'} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                 <span className="text-xl">{editingId ? '✏️' : '👤'}</span>
               </div>
               <div>
                 <h3 className="font-bold text-slate-800 tracking-tight">{editingId ? 'Editar Proveedor' : 'Nuevo Registro'}</h3>
                 <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">Control Maestro</p>
               </div>
            </div>
            {editingId && <button onClick={resetForm} className="text-[10px] font-bold text-slate-400 uppercase hover:text-rose-500 transition-colors">Cancelar</button>}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Tipo Documento</label>
                <select name="tipoDocumento" value={formData.tipoDocumento} onChange={handleInputChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500">
                  {Object.values(DocumentType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Identificación</label>
                <input type="text" name="identificacion" value={formData.identificacion || ''} onChange={handleInputChange} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-black outline-none ${editingId ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50 focus:ring-2 focus:ring-indigo-500'}`} required disabled={!!editingId} placeholder="12345678" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Nombre o Razón Social</label>
              <input type="text" name="nombre" value={formData.nombre || ''} onChange={handleInputChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase focus:ring-2 focus:ring-indigo-500 outline-none" required placeholder="NOMBRE COMPLETO" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Correo Electrónico</label>
                <input type="email" name="correo" value={formData.correo || ''} onChange={handleInputChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Teléfono Principal</label>
                <input type="text" name="telefono" value={formData.telefono || ''} onChange={handleInputChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="3001234567" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Dirección Fiscal / Física</label>
              <input type="text" name="direccion" value={formData.direccion || ''} onChange={handleInputChange} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="CALLE / CARRERA / AVENIDA" />
            </div>

            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3">
              <div className="flex items-center space-x-2 border-b border-indigo-100 pb-2">
                <span className="text-xs">🏦</span>
                <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Información Bancaria</h4>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <input type="text" name="entidadBancaria" value={formData.entidadBancaria || ''} onChange={handleInputChange} placeholder="NOMBRE DEL BANCO" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase outline-none focus:ring-2 focus:ring-indigo-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" name="numeroCuenta" value={formData.numeroCuenta || ''} onChange={handleInputChange} placeholder="N° CUENTA" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black outline-none focus:ring-2 focus:ring-indigo-500" />
                  <select name="tipoCuenta" value={formData.tipoCuenta} onChange={handleInputChange} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.values(BankAccountType).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button className={`w-full ${editingId ? 'bg-indigo-600 shadow-indigo-200' : 'bg-slate-900 shadow-slate-200'} text-white font-black py-4 rounded-xl transition-all shadow-xl active:scale-95 text-xs uppercase tracking-widest mt-2`}>
              {editingId ? 'Confirmar Cambios' : 'Registrar Proveedor'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <label className="flex items-center justify-center space-x-3 p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer group">
              <span className="text-2xl group-hover:scale-125 transition-transform duration-300">📑</span>
              <div className="text-left">
                <span className="block text-[10px] font-black text-slate-600 uppercase">Importación Masiva (CSV)</span>
                <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Auto-detección inteligente activada</span>
              </div>
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
            </label>
          </div>
        </div>

        {/* Listado de Directorio */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[750px]">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
            <div>
              <h3 className="font-black text-slate-800 text-xl uppercase tracking-tighter">Directorio de Proveedores</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{providers.length} registros blindados</p>
            </div>
            <div className="relative w-full md:w-80">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ID..." className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-100 shadow-sm transition-all" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-white sticky top-0 shadow-sm z-10 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entidad / ID</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contacto / Ubicación</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Información Financiera</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProviders.map(p => (
                  <tr key={p.identificacion} className={`hover:bg-slate-50 transition-all group ${editingId === p.identificacion ? 'bg-indigo-50' : ''}`}>
                    <td className="px-6 py-5">
                       <p className="text-xs font-black text-slate-900 uppercase truncate max-w-[200px]">{p.nombre}</p>
                       <p className="text-[10px] text-indigo-600 font-mono font-black">{p.identificacion}</p>
                    </td>
                    <td className="px-6 py-5">
                       <p className="text-[10px] text-slate-800 font-bold font-mono mb-1">{p.telefono || '---'}</p>
                       <p className="text-[9px] text-slate-500 font-medium italic truncate max-w-[180px]">{p.direccion || 'Sin dirección'}</p>
                    </td>
                    <td className="px-6 py-5">
                       <p className="text-[10px] text-slate-900 font-black uppercase mb-1">{p.entidadBancaria || '---'}</p>
                       <p className="text-[10px] text-slate-500 font-mono">{p.numeroCuenta || 'S/N'}</p>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end space-x-2">
                        <button onClick={() => setViewingProvider(p)} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-indigo-100 transition-all" title="Ver Ficha">👁️</button>
                        <button onClick={() => handleEditClick(p)} className="p-2.5 text-indigo-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-indigo-100 transition-all" title="Editar">✏️</button>
                        <button onClick={() => onDelete(p.identificacion)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-rose-100 transition-all" title="Eliminar Proveedor">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProviders.length === 0 && (
              <div className="py-20 text-center flex flex-col items-center">
                <span className="text-5xl mb-4 grayscale opacity-20">📂</span>
                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No hay proveedores que coincidan con la búsqueda</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visor de Ficha Maestra */}
      {viewingProvider && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
            <div className="bg-slate-900 p-10 text-white relative">
              <div className="absolute top-6 right-6">
                <button onClick={() => setViewingProvider(null)} className="text-white/40 hover:text-white text-3xl transition-all hover:rotate-90">×</button>
              </div>
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-3">Expediente de Proveedor</p>
              <h3 className="text-3xl font-black uppercase tracking-tighter leading-none mb-3">{viewingProvider.nombre}</h3>
              <p className="text-white/50 text-sm font-mono tracking-wider">{viewingProvider.tipoDocumento}: {viewingProvider.identificacion}</p>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="grid grid-cols-1 gap-6">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6">
                   <div>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Ubicación Registrada</p>
                     <p className="text-sm font-bold text-slate-800 flex items-center"><span className="mr-3 opacity-50">📍</span> {viewingProvider.direccion || 'No especificada'}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Teléfono</p>
                       <p className="text-sm font-black text-slate-900 font-mono flex items-center"><span className="mr-3 opacity-50">📞</span> {viewingProvider.telefono || 'N/A'}</p>
                     </div>
                     <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Email</p>
                       <p className="text-sm font-bold text-indigo-600 truncate flex items-center"><span className="mr-3 opacity-50">📧</span> {viewingProvider.correo || '---'}</p>
                     </div>
                   </div>
                </div>

                <div className="bg-indigo-600 p-8 rounded-[1.5rem] shadow-xl shadow-indigo-100 text-white">
                   <p className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] mb-4">Canal de Dispersión</p>
                   <div className="flex items-center space-x-4 mb-4">
                      <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-xl">🏦</div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-tight text-white">{viewingProvider.entidadBancaria || 'PENDIENTE'}</p>
                        <p className="text-[10px] text-indigo-200 font-bold uppercase">{viewingProvider.tipoCuenta}</p>
                      </div>
                   </div>
                   <p className="text-3xl font-mono font-black tracking-tighter">{viewingProvider.numeroCuenta || 'SIN CUENTA'}</p>
                </div>
              </div>
              
              <div className="pt-4">
                <button onClick={() => setViewingProvider(null)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95">Cerrar Expediente</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
