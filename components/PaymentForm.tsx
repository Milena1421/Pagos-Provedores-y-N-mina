
import React, { useState, useEffect } from 'react';
import { PaymentRecord, Category, PaymentStatus, SupportFile, Provider, DocumentType, BankAccountType } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from '../App';

interface PaymentFormProps {
  onSubmit: (data: { record: PaymentRecord, provider: Provider }) => void;
  onCancel: () => void;
  initialData?: PaymentRecord | null;
  nextRadicado: string;
  providers: Provider[];
}

export const PaymentForm: React.FC<PaymentFormProps> = ({ onSubmit, onCancel, initialData, nextRadicado, providers }) => {
  const [formData, setFormData] = useState<Partial<PaymentRecord>>({
    mesContable: new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' }),
    fechaDocumento: new Date().toISOString().split('T')[0],
    fechaPago: '',
    proveedor: '',
    identificacion: '',
    categoria: Category.Honorarios,
    descripcion: '',
    valor: 0,
    observacion: '',
    estado: PaymentStatus.Radicado,
    supports: [],
    motivoDevolucion: '',
    comprobantePago: '',
  });

  const [providerData, setProviderData] = useState<Partial<Provider>>({
    tipoDocumento: DocumentType.CC,
    correo: '',
    direccion: '',
    telefono: '',
    entidadBancaria: '',
    numeroCuenta: '',
    tipoCuenta: BankAccountType.Ahorros
  });

  const [supports, setSupports] = useState<SupportFile[]>([]);
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const cleanId = (id: string) => {
    return id.toString().trim().replace(/\./g, '').replace(/[^0-9\-]/g, '');
  };

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setSupports(initialData.supports || []);
      const matched = providers.find(p => cleanId(p.identificacion) === cleanId(initialData.identificacion));
      if (matched) {
        setProviderData(matched);
        setIsAutoFilled(true);
      }
    }
  }, [initialData, providers]);

  useEffect(() => {
    if (!formData.identificacion || initialData || isAiLoading) return;
    const cleanedSearchId = cleanId(formData.identificacion);
    const matchingProvider = providers.find(p => cleanId(p.identificacion) === cleanedSearchId);
    if (matchingProvider) {
      setFormData(prev => ({ ...prev, proveedor: matchingProvider.nombre }));
      setProviderData({
        tipoDocumento: matchingProvider.tipoDocumento,
        correo: matchingProvider.correo,
        direccion: matchingProvider.direccion, 
        telefono: matchingProvider.telefono,   
        entidadBancaria: matchingProvider.entidadBancaria,
        numeroCuenta: matchingProvider.numeroCuenta,
        tipoCuenta: matchingProvider.tipoCuenta
      });
      setIsAutoFilled(true);
    } else {
      if (isAutoFilled) setIsAutoFilled(false);
    }
  }, [formData.identificacion, providers, initialData, isAiLoading]);

  const uploadFileToSupabase = async (file: File): Promise<SupportFile> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('payments')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Upload Error:", uploadError);
      throw new Error(`Error subiendo archivo: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from('payments')
      .getPublicUrl(filePath);

    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      data: data.publicUrl
    };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'valor' ? parseFloat(value) || 0 : (name === 'identificacion' ? cleanId(value) : value)
    }));
    if (name === 'proveedor') setIsAutoFilled(false);
  };

  const handleProviderInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProviderData(prev => ({ ...prev, [name]: value }));
  };

  const handleAiScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAiLoading(true);
    try {
      const base64Data = await readFileAsBase64(file);
      const pureBase64 = base64Data.split(',')[1];
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Update: Using contents: { parts: [...] } for multi-part data as per SDK examples.
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: file.type, data: pureBase64 } },
            { text: `Extrae información para tesorería. REGLAS CRÍTICAS: 
              1. 'direccion' DEBE contener nomenclaturas (Calle, Carrera, Av, No, #). 
              2. 'telefono' DEBE contener ÚNICAMENTE dígitos (7 a 10). 
              3. NO intercambies estos campos bajo ninguna circunstancia. 
              4. Identifica NIT/Cédula, Razón Social, Valor Total, Fecha y Banco/Cuenta si están presentes.` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              nit_id: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              desc: { type: Type.STRING },
              category: { type: Type.STRING },
              bank: { type: Type.STRING },
              account: { type: Type.STRING },
              mail: { type: Type.STRING },
              telefono: { type: Type.STRING, description: "Solo números" },
              direccion: { type: Type.STRING, description: "Dirección física completa" }
            }
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      setFormData(prev => ({
        ...prev,
        proveedor: result.name || prev.proveedor,
        identificacion: result.nit_id ? cleanId(result.nit_id) : prev.identificacion,
        valor: result.amount || prev.valor,
        fechaDocumento: result.date || prev.fechaDocumento,
        descripcion: result.desc || prev.descripcion,
        categoria: (result.category as Category) || prev.categoria
      }));

      setProviderData(prev => ({
        ...prev,
        entidadBancaria: result.bank || prev.entidadBancaria,
        numeroCuenta: result.account || prev.numeroCuenta,
        correo: result.mail || prev.correo,
        telefono: result.telefono || prev.telefono,
        direccion: result.direccion || prev.direccion
      }));

      setIsUploading(true);
      const supportFile = await uploadFileToSupabase(file);
      setSupports(prev => [...prev, supportFile]);
      setIsAutoFilled(true);

    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error analizando documento");
    } finally {
      setIsAiLoading(false);
      setIsUploading(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    setIsUploading(true);
    try {
      const newFiles: SupportFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const support = await uploadFileToSupabase(files[i]);
        newFiles.push(support);
      }
      setSupports(prev => [...prev, ...newFiles]);
    } catch (e: any) {
      alert(e.message || "Error al subir archivos");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) {
      alert("Espere a que terminen de cargar los archivos.");
      return;
    }

    const record: PaymentRecord = {
      id: initialData?.id || crypto.randomUUID(),
      radicado: initialData?.radicado || `RAD-${nextRadicado}`,
      mesContable: formData.mesContable || '',
      fechaDocumento: formData.fechaDocumento || '',
      fechaPago: formData.fechaPago || '',
      proveedor: formData.proveedor || '',
      identificacion: cleanId(formData.identificacion || ''),
      categoria: (formData.categoria as Category) || Category.Honorarios,
      descripcion: formData.descripcion || '',
      valor: formData.valor || 0,
      observacion: formData.observacion || '',
      estado: (formData.estado as PaymentStatus) || PaymentStatus.Radicado,
      supports: supports,
      comprobantePago: formData.comprobantePago,
      motivoDevolucion: formData.motivoDevolucion,
      createdAt: initialData?.createdAt || Date.now(),
    };

    const provider: Provider = {
      identificacion: record.identificacion,
      nombre: record.proveedor,
      tipoDocumento: providerData.tipoDocumento || DocumentType.CC,
      correo: providerData.correo || '',
      direccion: providerData.direccion || '',
      telefono: providerData.telefono || '',
      entidadBancaria: providerData.entidadBancaria || '',
      numeroCuenta: providerData.numeroCuenta || '',
      tipoCuenta: providerData.tipoCuenta || BankAccountType.Ahorros,
    };
    onSubmit({ record, provider });
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 max-w-6xl mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-500 mb-20">
      {(isAiLoading || isUploading) && (
        <div className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-xl flex items-center justify-center">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col items-center max-w-xs text-center">
             <div className="w-16 h-16 border-4 border-slate-900 border-t-indigo-600 rounded-full animate-spin mb-8"></div>
             <p className="font-black text-slate-900 text-xl tracking-tighter uppercase">{isAiLoading ? 'IA Analizando Factura' : 'Sincronizando Archivos'}</p>
             <p className="text-xs text-slate-400 mt-3 font-bold uppercase tracking-widest leading-relaxed">Protegiendo la integridad de tus datos maestros</p>
          </div>
        </div>
      )}

      <div className="bg-slate-50 p-8 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
            {initialData ? `Edición de Trámite: ${initialData.radicado}` : `Nuevo Radicado de Pago: RAD-${nextRadicado}`}
          </h3>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1 italic">Ingeniería 365 • Gestión de Egresos</p>
        </div>
        {!initialData && (
          <label className={`relative flex items-center space-x-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer transition-all ${isAiLoading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-black shadow-xl hover:-translate-y-1 active:scale-95'}`}>
            <span>✨ Escaneo Inteligente</span>
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleAiScan} disabled={isAiLoading} />
          </label>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-12">
        {/* SECCIÓN DATOS MAESTROS */}
        <div className="space-y-8">
          <div className="flex items-center space-x-3 border-b-4 border-indigo-600 pb-3 w-fit pr-12">
            <span className="text-2xl">🏛️</span>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Información Maestra del Proveedor</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-4">
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Identificación Fiscal</label>
              <input type="text" name="identificacion" value={formData.identificacion} onChange={handleInputChange} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none font-black font-mono text-slate-900 text-sm transition-all shadow-sm" placeholder="NIT / CÉDULA" required />
            </div>
            <div className="md:col-span-8">
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Beneficiario / Razón Social</label>
              <div className="relative">
                <input type="text" name="proveedor" value={formData.proveedor} onChange={handleInputChange} className={`w-full px-5 py-4 border-2 rounded-2xl focus:border-indigo-600 outline-none transition-all uppercase font-black text-sm shadow-sm ${isAutoFilled ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'border-slate-100 bg-white'}`} placeholder="NOMBRE COMPLETO DE LA ENTIDAD" required />
                {isAutoFilled && <span className="absolute -top-3 right-6 bg-indigo-600 text-white text-[9px] px-3 py-1 rounded-full uppercase font-black shadow-lg">Validado en Directorio</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50 p-8 rounded-[2rem] border border-slate-100 shadow-inner">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Tipo de Documento</label>
              <select name="tipoDocumento" value={providerData.tipoDocumento} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-black outline-none bg-white">
                {Object.values(DocumentType).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Email Corporativo</label>
              <input type="email" name="correo" value={providerData.correo} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold outline-none bg-white" placeholder="tesoreria@empresa.com" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Teléfono Principal</label>
              <input type="text" name="telefono" value={providerData.telefono} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-mono font-black outline-none bg-white" placeholder="Únicamente números" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Dirección Física</label>
              <input type="text" name="direccion" value={providerData.direccion} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold outline-none bg-white" placeholder="Calle/Carrera/Nomenclatura" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-slate-900 p-8 rounded-[2rem] shadow-2xl">
            <div>
              <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">Entidad Bancaria</label>
              <input type="text" name="entidadBancaria" value={providerData.entidadBancaria} onChange={handleProviderInputChange} className="w-full px-5 py-4 border-2 border-slate-800 bg-slate-800 text-white rounded-2xl text-xs font-black uppercase outline-none focus:border-indigo-600 transition-all" placeholder="NOMBRE DEL BANCO" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">Número de Cuenta</label>
              <input type="text" name="numeroCuenta" value={providerData.numeroCuenta} onChange={handleProviderInputChange} className="w-full px-5 py-4 border-2 border-slate-800 bg-slate-800 text-white rounded-2xl text-lg font-mono font-black tracking-widest outline-none focus:border-indigo-600 transition-all" placeholder="0000000000" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">Tipo de Cuenta</label>
              <select name="tipoCuenta" value={providerData.tipoCuenta} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-800 bg-slate-800 text-white rounded-2xl text-xs font-black outline-none focus:border-indigo-600 transition-all">
                {Object.values(BankAccountType).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* SECCIÓN DETALLE DEL GASTO */}
        <div className="space-y-8 pt-6">
          <div className="flex items-center space-x-3 border-b-4 border-slate-900 pb-3 w-fit pr-12">
            <span className="text-2xl">📈</span>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Concepto y Ejecución Presupuestal</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Categoría del Gasto</label>
              <select name="categoria" value={formData.categoria} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-slate-900 transition-all shadow-sm">
                {Object.values(Category).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Importe Total a Pagar</label>
              <input type="number" name="valor" value={formData.valor} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-xl font-black text-indigo-900 outline-none focus:border-slate-900 transition-all shadow-sm" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Periodo Contable</label>
              <input type="text" name="mesContable" value={formData.mesContable} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase outline-none focus:border-slate-900 transition-all shadow-sm" required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="grid grid-cols-2 gap-6">
               <div>
                 <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Fecha Documento</label>
                 <input type="date" name="fechaDocumento" value={formData.fechaDocumento} onChange={handleInputChange} className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-slate-900 shadow-sm" required />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Fecha Pago Estimada</label>
                 <input type="date" name="fechaPago" value={formData.fechaPago} onChange={handleInputChange} className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-slate-900 shadow-sm" />
               </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Descripción del Trámite</label>
              <input type="text" name="descripcion" value={formData.descripcion} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-slate-900 shadow-sm" placeholder="Resumen del concepto de cobro..." required />
            </div>
          </div>
        </div>

        {/* SECCIÓN SOPORTES Y ESTADO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-slate-100">
           <div className="space-y-6">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Soportes Documentales ({supports.length})</label>
              <div className="border-4 border-dashed border-slate-100 rounded-[2rem] p-12 flex flex-col items-center hover:bg-slate-50 transition-all cursor-pointer relative group">
                <span className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">📁</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Haz clic o arrastra archivos para cargarlos en la nube</span>
                <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                {supports.map(s => (
                  <span key={s.id} className="px-5 py-3 bg-slate-900 text-white text-[10px] font-black rounded-2xl flex items-center shadow-xl animate-in zoom-in-50">
                    <span className="truncate max-w-[140px]">{s.name}</span>
                    <button type="button" onClick={() => setSupports(prev => prev.filter(f => f.id !== s.id))} className="ml-4 text-rose-500 font-black text-lg hover:scale-125 transition-all">×</button>
                  </span>
                ))}
              </div>
           </div>
           <div className="space-y-6">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Estado del Radicado</label>
              <div className="flex space-x-3 bg-slate-50 p-3 rounded-[1.5rem] border border-slate-100 shadow-inner">
                {Object.values(PaymentStatus).map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFormData(prev => ({...prev, estado: status}))}
                    className={`flex-1 py-5 rounded-xl text-[10px] font-black transition-all transform active:scale-95 shadow-md uppercase tracking-widest ${
                      formData.estado === status 
                        ? (status === PaymentStatus.Pagado ? 'bg-emerald-600 text-white shadow-emerald-200' : 
                           status === PaymentStatus.Devuelto ? 'bg-rose-600 text-white shadow-rose-200' : 'bg-slate-900 text-white shadow-slate-200')
                        : 'bg-white text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <textarea name="observacion" value={formData.observacion} onChange={handleInputChange} rows={4} className="w-full px-6 py-5 border-2 border-slate-100 rounded-[1.5rem] text-xs font-medium outline-none focus:border-slate-900 shadow-sm" placeholder="Observaciones adicionales de tesorería..."></textarea>
           </div>
        </div>

        <div className="flex justify-end space-x-6 pt-12 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-10 py-5 text-slate-400 font-black text-xs uppercase tracking-[0.2em] hover:text-slate-900 transition-colors">Descartar</button>
          <button type="submit" disabled={isUploading} className={`px-16 py-5 ${isUploading ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-black'} text-white font-black rounded-2xl shadow-2xl transition-all transform hover:-translate-y-2 active:scale-95 text-xs uppercase tracking-[0.2em]`}>
            {initialData ? 'Guardar Cambios' : 'Generar Radicado'}
          </button>
        </div>
      </form>
    </div>
  );
};
