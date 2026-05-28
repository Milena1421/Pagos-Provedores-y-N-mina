import React from 'react';
import { AppUser, ViewType } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  availableViews: ViewType[];
  currentUser: AppUser;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  adminEmail: string;
  onAdminEmailChange: (email: string) => void;
}

const viewLabels: Record<ViewType, string> = {
  dashboard: 'Panel Principal',
  table: 'Cuentas x Pagar',
  directory: 'Directorio',
  form: 'Nuevo Registro'
};

const viewIcons: Record<ViewType, string> = {
  dashboard: '🏠',
  table: '📋',
  directory: '👥',
  form: '➕'
};

const headerTitles: Record<ViewType, string> = {
  dashboard: 'Dashboard de Control',
  form: 'Formulario de Radicacion',
  table: 'Historial de Pagos y Nomina',
  directory: 'Directorio de Proveedores'
};

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  availableViews,
  currentUser,
  onViewChange,
  onLogout,
  adminEmail,
  onAdminEmailChange
}) => {
  const brandBadgeUrl =
    'https://assets-sam.mkt.dynamics.com/2be9f283-e2e5-40bf-b6a6-d1e8356bf9a7/digitalassets/images/4278929a-4da5-f011-bbd3-002248dfbfde?ts=638956381317856213';

  const initials = currentUser.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const NavItem = ({ view }: { view: ViewType }) => (
    <button
      onClick={() => onViewChange(view)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
        currentView === view ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      <span className="text-xl">{viewIcons[view]}</span>
      <span className="font-medium">{viewLabels[view]}</span>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 p-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#5B6CFF] p-1.5 shadow-sm">
              <img src={brandBadgeUrl} alt="i365 plus" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none text-blue-800">Pagos i365</h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto p-4">
          {availableViews.map((view) => (
            <NavItem key={view} view={view} />
          ))}
        </nav>

        {currentUser.permissions.canManageNotifications && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center space-x-2">
              <span className="text-sm">✉️</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Correos de Alerta</span>
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] font-bold text-slate-500">DESTINATARIOS (comas):</label>
              <textarea
                value={adminEmail}
                onChange={(event) => onAdminEmailChange(event.target.value)}
                placeholder="correo1@test.com, correo2@test.com"
                rows={2}
                className="w-full resize-none rounded bg-white px-2 py-1.5 text-[10px] font-medium outline-none focus:ring-1 focus:ring-blue-500 border border-slate-200"
              />
              <p className="mt-1 text-[8px] italic text-slate-400">Separa multiples correos con una coma.</p>
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 p-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Sesion iniciada como</p>
            <p className="text-sm font-semibold text-slate-800">{currentUser.displayName}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">{currentUser.role}</p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-600"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
          <div className="flex items-center space-x-4">
            <button className="text-2xl md:hidden" onClick={() => alert('Menu movil proximamente')}>
              ☰
            </button>
            <h2 className="text-lg font-semibold text-slate-800">{headerTitles[currentView]}</h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden text-right md:block">
              <p className="text-xs font-semibold text-slate-800">{currentUser.displayName}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{currentUser.role}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
              {initials}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto w-full max-w-[110rem]">{children}</div>
        </div>
      </main>
    </div>
  );
};
