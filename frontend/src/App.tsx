import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthContext } from '@/context/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullSpinner } from '@/components/ui';
import { LoginPage } from '@/pages/Login';
import { FichajePage } from '@/pages/employee/Fichaje';
import { HistorialPage } from '@/pages/employee/Historial';
import { AdminDashboard } from '@/pages/admin/Dashboard';
import { AdminEmpleados } from '@/pages/admin/Empleados';
import { AdminHorarios } from '@/pages/admin/Horarios';
import { AdminAusencias } from '@/pages/admin/Ausencias';
import { AdminValidaciones } from '@/pages/admin/Validaciones';
import { AdminRegistros } from '@/pages/admin/Registros';
import { AdminLogs } from '@/pages/admin/Logs';

const App: React.FC = () => {
  const { isAuthenticated, isAdmin, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <FullSpinner label="Cargando…" />
      </div>
    );
  }

  const adminRoute = (el: React.ReactNode) =>
    isAdmin ? el : <Navigate to="/fichaje" replace />;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={isAuthenticated ? <AppLayout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Navigate to={isAdmin ? '/admin' : '/fichaje'} replace />} />
        <Route path="/fichaje" element={<FichajePage />} />
        <Route path="/historial" element={<HistorialPage />} />
        <Route path="/admin" element={adminRoute(<AdminDashboard />)} />
        <Route path="/admin/empleados" element={adminRoute(<AdminEmpleados />)} />
        <Route path="/admin/horarios" element={adminRoute(<AdminHorarios />)} />
        <Route path="/admin/ausencias" element={adminRoute(<AdminAusencias />)} />
        <Route path="/admin/validaciones" element={adminRoute(<AdminValidaciones />)} />
        <Route path="/admin/registros" element={adminRoute(<AdminRegistros />)} />
        <Route path="/admin/logs" element={adminRoute(<AdminLogs />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
