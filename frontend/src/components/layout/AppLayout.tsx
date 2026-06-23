import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  Clock, History, LayoutDashboard, Users, CalendarRange, CalendarOff,
  CheckSquare, FileText, LogIn as LogInIcon, LogOut, Fingerprint,
  Settings as SettingsIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthContext } from '@/context/auth';
import { useSettings } from '@/context/settings';
import { SupportButton } from '@/components/SupportButton';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import { cn } from '@/components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/fichaje',   label: 'Fichaje',      icon: <Clock   className="w-4 h-4 shrink-0" /> },
  { to: '/historial', label: 'Mi historial', icon: <History className="w-4 h-4 shrink-0" /> },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin',              label: 'Panel',        icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
  { to: '/admin/empleados',    label: 'Empleados',    icon: <Users           className="w-4 h-4 shrink-0" /> },
  { to: '/admin/horarios',     label: 'Horarios',     icon: <CalendarRange   className="w-4 h-4 shrink-0" /> },
  { to: '/admin/ausencias',    label: 'Ausencias',    icon: <CalendarOff     className="w-4 h-4 shrink-0" /> },
  { to: '/admin/validaciones', label: 'Validaciones', icon: <CheckSquare     className="w-4 h-4 shrink-0" /> },
  { to: '/admin/registros',    label: 'Registros',    icon: <FileText        className="w-4 h-4 shrink-0" /> },
  { to: '/admin/logs',         label: 'Accesos',      icon: <LogInIcon       className="w-4 h-4 shrink-0" /> },
  { to: '/admin/ajustes',      label: 'Ajustes',      icon: <SettingsIcon    className="w-4 h-4 shrink-0" /> },
];

const STORAGE_KEY = 'sidebar-expanded';
const MD = 768; // breakpoint equivalente a Tailwind md

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export const AppLayout: React.FC = () => {
  const { user, isAdmin, logout } = useAuthContext();
  const { companyName } = useSettings();
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  // Estado persistido del usuario (expandido/colapsado en desktop)
  const [expanded, setExpanded] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) !== 'false'
  );

  // En móvil el sidebar es siempre icono-only, sin importar el estado guardado
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MD);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MD);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isExpanded = expanded && !isMobile;

  const toggle = () =>
    setExpanded((prev) => {
      localStorage.setItem(STORAGE_KEY, String(!prev));
      return !prev;
    });

  // Dropdown de perfil
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const notificationCount = useNotificationCount(isAdmin);
  const initials = user ? getInitials(user.name) : '?';

  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200 ease-in-out',
          isExpanded ? 'w-56' : 'w-16'
        )}
      >
        {/* Empresa + toggle (el toggle solo aparece en desktop) */}
        <div className="relative flex items-center h-16 px-3 border-b border-slate-100 shrink-0">
          <Link to="/" className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
            <div className="grid place-items-center w-9 h-9 rounded-xl bg-brand-600 text-white shrink-0 shadow-md shadow-brand-600/20">
              <Fingerprint className="w-4 h-4" />
            </div>
            {isExpanded && (
              <span className="font-semibold text-slate-900 truncate text-sm leading-tight">
                {companyName ?? 'NuxoAsist'}
              </span>
            )}
          </Link>
          {!isMobile && (
            <button
              onClick={toggle}
              className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm grid place-items-center text-slate-400 hover:text-slate-600 transition-colors z-10"
              title={isExpanded ? 'Colapsar menú' : 'Expandir menú'}
            >
              {isExpanded
                ? <ChevronLeft  className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </button>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin'}
              title={!isExpanded ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  !isExpanded && 'justify-center px-0',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )
              }
            >
              {item.icon}
              {isExpanded && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mx-2 border-t border-slate-100 shrink-0" />

        {/* Soporte */}
        <div className="p-2 shrink-0">
          <SupportButton expanded={isExpanded} />
        </div>

        <div className="mx-2 border-t border-slate-100 shrink-0" />

        {/* Perfil con iniciales */}
        <div ref={profileRef} className="relative p-2 shrink-0">
          <button
            onClick={() => setProfileOpen((prev) => !prev)}
            title={!isExpanded ? (user?.name ?? 'Perfil') : undefined}
            className={cn(
              'flex items-center gap-3 w-full rounded-lg p-2 hover:bg-slate-100 transition-all duration-150',
              !isExpanded && 'justify-center'
            )}
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-bold select-none">
                {initials}
              </div>
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none grid place-items-center px-0.5 ring-2 ring-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </div>
            {isExpanded && (
              <div className="min-w-0 text-left">
                <p className="text-sm font-medium text-slate-900 truncate leading-tight">{user?.name}</p>
                <p className="text-xs text-slate-400 leading-tight">{isAdmin ? 'Administrador' : 'Empleado'}</p>
              </div>
            )}
          </button>

          {profileOpen && (
            <div
              className={cn(
                'absolute bottom-full mb-1.5 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50',
                isExpanded ? 'left-2 right-2' : 'left-1 w-48'
              )}
            >
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                <span className="inline-block mt-1.5 text-xs bg-brand-50 text-brand-700 rounded-full px-2 py-0.5 font-medium">
                  {isAdmin ? 'Administrador' : 'Empleado'}
                </span>
              </div>
              <button
                onClick={() => { setProfileOpen(false); logout(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>

      </aside>

      {/* ── Contenido principal ── */}
      <main
        className={cn(
          'flex-1 min-w-0 min-h-screen transition-[margin] duration-200 ease-in-out',
          isExpanded ? 'ml-56' : 'ml-16'
        )}
      >
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </main>

    </div>
  );
};
