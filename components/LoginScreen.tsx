import React, { useState } from 'react';
import { AppUser } from '../types';

interface LoginScreenProps {
  users: AppUser[];
  onLogin: (username: string, password: string) => boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ users, onLogin }) => {
  const [username, setUsername] = useState(users[0]?.username || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const success = onLogin(username, password);

    if (!success) {
      setError('Usuario o contrasena incorrectos.');
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef3fa_0%,#e6edf6_100%)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-[540px] rounded-[2.25rem] border border-slate-200/80 bg-white px-8 py-9 shadow-[0_18px_45px_rgba(15,23,42,0.12)] md:px-10 md:py-10">
          <div className="mx-auto max-w-[390px]">
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 md:text-3xl">Ingreso a Cuentas por Pagar</h1>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.24em] text-slate-400">
                Selecciona y contrasena
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-3 block text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                  Acceso
                </label>
                <div className="relative">
                  <select
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setError('');
                    }}
                    className="w-full appearance-none rounded-[1.15rem] border-2 border-slate-200 bg-white px-5 py-4 text-lg font-bold text-slate-800 outline-none transition-all focus:border-blue-500"
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.username}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-6 flex items-center text-slate-700">⌄</span>
                </div>
              </div>

              <div>
                <label className="mb-3 block text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                  Contrasena
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError('');
                  }}
                  className="w-full rounded-[1.15rem] border-2 border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-800 outline-none transition-all focus:border-blue-500"
                  placeholder="Ingresa tu contrasena"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-[1.15rem] bg-[linear-gradient(90deg,#4559e8_0%,#5b46ea_100%)] px-6 py-4 text-sm font-black uppercase tracking-[0.22em] text-white shadow-[0_12px_24px_rgba(76,81,255,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(76,81,255,0.4)] active:scale-[0.99]"
              >
                Ingresar
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
