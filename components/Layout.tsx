
import React from 'react';
import { ViewType } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  adminEmail: string;
  onAdminEmailChange: (email: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  currentView, 
  onViewChange,
  adminEmail,
  onAdminEmailChange
}) => {
  const NavItem = ({ view, label, icon }: { view: ViewType, label: string, icon: string }) => (
    <button
      onClick={() => onViewChange(view)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
        currentView === view 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-blue-800 flex items-center space-x-2">
            <span className="text-2xl">📊</span>
            <span>Control Pagos</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">Gestión de Nómina</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavItem view="dashboard" label="Panel Principal" icon="🏠" />
          <NavItem view="table" label="Cuentas x Pagar" icon="📋" />
          <NavItem view="directory" label="Directorio" icon="👥" />
          <NavItem view="form" label="Nuevo Registro" icon="➕" />
        </nav>

        {/* Configuración de Notificaciones */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2 mb-3">
            <span className="text-sm">✉️</span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Correos de Alerta</span>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-slate-500 block">DESTINATARIOS (comas):</label>
            <textarea 
              value={adminEmail}
              onChange={(e) => onAdminEmailChange(e.target.value)}
              placeholder="correo1@test.com, correo2@test.com"
              rows={2}
              className="w-full px-2 py-1.5 text-[10px] border border-slate-200 rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 font-medium resize-none"
            />
            <p className="text-[8px] text-slate-400 mt-1 italic">Separa múltiples correos con una coma.</p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-xs text-slate-500">Sesión iniciada como</p>
            <p className="text-sm font-semibold text-slate-800">Administrador</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10">
          <div className="flex items-center space-x-4">
             <button className="md:hidden text-2xl" onClick={() => alert('Menú móvil próximamente')}>☰</button>
             <h2 className="text-lg font-semibold text-slate-800">
               {currentView === 'dashboard' && 'Dashboard de Control'}
               {currentView === 'form' && 'Formulario de Radicación'}
               {currentView === 'table' && 'Historial de Pagos y Nómina'}
               {currentView === 'directory' && 'Directorio de Proveedores'}
             </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              AD
            </div>
          </div>
        </header>

        {/* View Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
