
import React, { useState, useEffect } from 'react';
import { PaymentRecord, PaymentStatus, Category } from '../types';
import { GoogleGenAI } from "@google/genai";

interface DashboardProps {
  records: PaymentRecord[];
  onAddClick: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ records, onAddClick }) => {
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);

  const totalPendiente = records
    .filter(r => r.estado === PaymentStatus.Radicado)
    .reduce((sum, r) => sum + r.valor, 0);

  const totalPagado = records
    .filter(r => r.estado === PaymentStatus.Pagado)
    .reduce((sum, r) => sum + r.valor, 0);

  const recordsByStatus = {
    [PaymentStatus.Radicado]: records.filter(r => r.estado === PaymentStatus.Radicado).length,
    [PaymentStatus.Pagado]: records.filter(r => r.estado === PaymentStatus.Pagado).length,
    [PaymentStatus.Devuelto]: records.filter(r => r.estado === PaymentStatus.Devuelto).length,
  };

  const generateInsight = async () => {
    if (records.length === 0) return;
    setLoadingInsight(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analiza los siguientes datos de pagos a proveedores y nómina. 
      Proporciona un resumen ejecutivo muy breve (3 frases) en español sobre el estado financiero actual:
      Total de registros: ${records.length}
      Total pendiente por pagar: $${totalPendiente.toLocaleString()}
      Total ya pagado: $${totalPagado.toLocaleString()}
      Registros devueltos: ${recordsByStatus[PaymentStatus.Devuelto]}
      Categorías más frecuentes: ${Array.from(new Set(records.map(r => r.categoria))).join(', ')}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setInsight(response.text || 'No se pudo generar el análisis.');
    } catch (e) {
      console.error(e);
      setInsight('Error al conectar con la IA para el análisis.');
    } finally {
      setLoadingInsight(false);
    }
  };

  useEffect(() => {
    if (records.length > 0) {
      generateInsight();
    }
  }, [records.length]);

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-bold mb-2">Bienvenido al Sistema de Pagos</h1>
          <p className="text-blue-100 max-w-xl">
            Gestiona tus cuentas por pagar, nómina y proveedores de forma centralizada. 
            Actualmente tienes <span className="font-bold underline">{recordsByStatus[PaymentStatus.Radicado]}</span> trámites pendientes.
          </p>
          <button 
            onClick={onAddClick}
            className="mt-6 bg-white text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-50 transition-colors shadow-lg"
          >
            + Radicar Nuevo Pago
          </button>
        </div>
        <div className="absolute top-0 right-0 p-4 opacity-10 text-9xl">💰</div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Valor Pendiente" value={`$${totalPendiente.toLocaleString()}`} color="blue" icon="⏳" />
        <StatCard label="Valor Pagado" value={`$${totalPagado.toLocaleString()}`} color="green" icon="✅" />
        <StatCard label="Trámites Radicados" value={recordsByStatus[PaymentStatus.Radicado].toString()} color="amber" icon="📄" />
        <StatCard label="Devueltos / Errores" value={recordsByStatus[PaymentStatus.Devuelto].toString()} color="red" icon="⚠️" />
      </div>

      {/* AI Insight Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 flex items-center space-x-2">
            <span>✨</span>
            <span>Resumen Inteligente (Gemini AI)</span>
          </h3>
          <button 
            onClick={generateInsight}
            disabled={loadingInsight}
            className="text-xs text-blue-600 hover:underline"
          >
            {loadingInsight ? 'Analizando...' : 'Actualizar análisis'}
          </button>
        </div>
        <div className="text-slate-600 italic bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
          {records.length === 0 
            ? "No hay suficientes datos para generar un análisis. Registre algunos pagos primero." 
            : (loadingInsight ? "Generando resumen ejecutivo..." : insight)
          }
        </div>
      </div>

      {/* Recent Activity Mini-List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Últimos Movimientos</h3>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Recientes</span>
        </div>
        <div className="divide-y divide-slate-100">
          {records.slice(0, 5).map(record => (
            <div key={record.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${getStatusColor(record.estado)} bg-opacity-10`}>
                  {record.radicado.slice(-2)}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{record.proveedor}</p>
                  <p className="text-xs text-slate-500">ID: {record.identificacion} • {record.categoria} • {record.radicado}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">${record.valor.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{record.mesContable}</p>
              </div>
            </div>
          ))}
          {records.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic">No hay registros recientes</div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, icon }: { label: string, value: string, color: string, icon: string }) => {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }[color as 'blue' | 'green' | 'amber' | 'red'];

  return (
    <div className={`p-5 rounded-xl border ${colorClasses} shadow-sm`}>
      <div className="flex justify-between items-start">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
};

const getStatusColor = (status: PaymentStatus) => {
  switch (status) {
    case PaymentStatus.Radicado: return 'text-blue-600 bg-blue-100';
    case PaymentStatus.Pagado: return 'text-green-600 bg-green-100';
    case PaymentStatus.Devuelto: return 'text-red-600 bg-red-100';
    default: return 'text-slate-600 bg-slate-100';
  }
};
