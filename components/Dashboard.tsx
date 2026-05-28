import React, { useEffect, useMemo, useState } from 'react';
import { PaymentRecord, PaymentStatus } from '../types';
import { GoogleGenAI } from '@google/genai';
import { appConfig } from '../config';

interface DashboardProps {
  records: PaymentRecord[];
  onAddClick: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ records, onAddClick }) => {
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('todos');

  const monthOptions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.mesContable).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
    );
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (selectedMonth === 'todos') return records;
    return records.filter((record) => record.mesContable === selectedMonth);
  }, [records, selectedMonth]);

  const totalPendiente = filteredRecords
    .filter((record) => record.estado === PaymentStatus.Radicado)
    .reduce((sum, record) => sum + record.valor, 0);

  const totalPagado = filteredRecords
    .filter((record) => record.estado === PaymentStatus.Pagado)
    .reduce((sum, record) => sum + record.valor, 0);

  const recordsByStatus = {
    [PaymentStatus.Radicado]: filteredRecords.filter((record) => record.estado === PaymentStatus.Radicado).length,
    [PaymentStatus.Pagado]: filteredRecords.filter((record) => record.estado === PaymentStatus.Pagado).length,
    [PaymentStatus.Devuelto]: filteredRecords.filter((record) => record.estado === PaymentStatus.Devuelto).length,
  };

  const generateInsight = async () => {
    if (filteredRecords.length === 0) {
      setInsight('');
      return;
    }

    setLoadingInsight(true);
    try {
      if (!appConfig.geminiApiKey) {
        setInsight('Configura GEMINI_API_KEY para habilitar el analisis con IA.');
        return;
      }

      const ai = new GoogleGenAI({ apiKey: appConfig.geminiApiKey });
      const prompt = `Analiza los siguientes datos de pagos a proveedores y nomina.
      Proporciona un resumen ejecutivo muy breve (3 frases) en espanol sobre el estado financiero actual.
      Mes filtrado: ${selectedMonth === 'todos' ? 'Todos los meses' : selectedMonth}
      Total de registros: ${filteredRecords.length}
      Total pendiente por pagar: $${totalPendiente.toLocaleString()}
      Total ya pagado: $${totalPagado.toLocaleString()}
      Registros devueltos: ${recordsByStatus[PaymentStatus.Devuelto]}
      Categorias mas frecuentes: ${Array.from(new Set(filteredRecords.map((record) => record.categoria))).join(', ')}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setInsight(response.text || 'No se pudo generar el analisis.');
    } catch (error) {
      console.error(error);
      setInsight('Error al conectar con la IA para el analisis.');
    } finally {
      setLoadingInsight(false);
    }
  };

  useEffect(() => {
    if (filteredRecords.length > 0) {
      generateInsight();
    } else {
      setInsight('');
    }
  }, [selectedMonth, records.length]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Bienvenido al Sistema de Pagos</h1>
            <p className="text-blue-100 max-w-xl">
              Gestiona tus cuentas por pagar, nomina y proveedores de forma centralizada.
              Actualmente tienes <span className="font-bold underline">{recordsByStatus[PaymentStatus.Radicado]}</span>{' '}
              tramites pendientes.
            </p>
            <button
              onClick={onAddClick}
              className="mt-6 bg-white text-blue-700 px-6 py-2 rounded-full font-bold hover:bg-blue-50 transition-colors shadow-lg"
            >
              + Radicar Nuevo Pago
            </button>
          </div>

          <div className="w-full md:w-64">
            <label className="block text-xs uppercase tracking-[0.2em] text-blue-100 font-bold mb-2">
              Filtrar por mes
            </label>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-800 outline-none shadow-lg"
            >
              <option value="todos">Todos los meses</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-4 opacity-10 text-9xl">$</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Valor Pendiente" value={`$${totalPendiente.toLocaleString()}`} color="blue" icon="⏳" />
        <StatCard label="Valor Pagado" value={`$${totalPagado.toLocaleString()}`} color="green" icon="✅" />
        <StatCard label="Tramites Radicados" value={recordsByStatus[PaymentStatus.Radicado].toString()} color="amber" icon="📄" />
        <StatCard label="Devueltos / Errores" value={recordsByStatus[PaymentStatus.Devuelto].toString()} color="red" icon="⚠️" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Ultimos Movimientos</h3>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            {selectedMonth === 'todos' ? 'Recientes' : selectedMonth}
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredRecords.slice(0, 5).map((record) => (
            <div key={record.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${getStatusColor(record.estado)} bg-opacity-10`}>
                  {record.radicado.slice(-2)}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{record.proveedor}</p>
                  <p className="text-xs text-slate-500">
                    ID: {record.identificacion} • {record.categoria} • {record.radicado}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">${record.valor.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{record.mesContable}</p>
              </div>
            </div>
          ))}
          {filteredRecords.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic">No hay registros para el mes seleccionado</div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) => {
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
    case PaymentStatus.Radicado:
      return 'text-blue-600 bg-blue-100';
    case PaymentStatus.Pagado:
      return 'text-green-600 bg-green-100';
    case PaymentStatus.Devuelto:
      return 'text-red-600 bg-red-100';
    default:
      return 'text-slate-600 bg-slate-100';
  }
};
