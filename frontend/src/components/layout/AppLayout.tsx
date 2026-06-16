import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Clock, History, LayoutDashboard, Users, CalendarRange, CalendarOff,
  CheckSquare, FileText, LogIn as LogInIcon, LogOut, Fingerprint, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuthContext } from '@/context/auth';
import { useSettings } from '@/context/settings';
import { cn } from '@/components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/fichaje', label: 'Fichaje', icon: <Clock className="w-4 h-4" /> },
  { to: '/historial', label: 'Mi historial', icon: <History className="w-4 h-4" /> },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Panel', icon: <LayoutDashboard className="w-4 h-4" /> },
  { to: '/admin/empleados', label: 'Empleados', icon: <Users className="w-4 h-4" /> },
  { to: '/admin/horarios', label: 'Horarios', icon: <CalendarRange className="w-4 h-4" /> },
  { to: '/admin/ausencias', label: 'Ausencias', icon: <CalendarOff className="w-4 h-4" /> },
  { to: '/admin/validaciones', label: 'Validaciones', icon: <CheckSquare className="w-4 h-4" /> },
  { to: '/admin/registros', label: 'Registros', icon: <FileText className="w-4 h-4" /> },
  { to: '/admin/logs', label: 'Accesos', icon: <LogInIcon className="w-4 h-4" /> },
  { to: '/admin/ajustes', label: 'Ajustes', icon: <SettingsIcon className="w-4 h-4" /> },
];

export const AppLayout: React.FC = () => {
  const { user, isAdmin, logout } = useAuthContext();
  const { companyName } = useSettings();
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-3xl px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="grid place-items-center w-9 h-9 rounded-xl bg-brand-600 text-white">
                <Fingerprint className="w-5 h-5" />
              </div>
              <span className="font-bold text-slate-900 truncate max-w-[160px]">{companyName ?? 'Fichaje'}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right leading-tight hidden sm:block">
                <p className="text-sm font-medium text-slate-800">{user?.name}</p>
                <p className="text-xs text-slate-400">{isAdmin ? 'Administrador' : 'Empleado'}</p>
              </div>
              <button
                onClick={logout}
                className="grid place-items-center w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <nav className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mb-px">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-20">
        <Outlet />
      </main>
    </div>
  );
};
