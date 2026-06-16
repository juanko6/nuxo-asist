import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';
import { Fingerprint, Delete, QrCode, Check, X, LogIn, LogOut } from 'lucide-react';
import { kioskService, type KioskPunchResult } from '@/services/api/kiosk';
import { useAuthContext } from '@/context/auth';
import { useSettings } from '@/context/settings';
import { Button } from '@/components/ui';
import { formatTime } from '@/lib/format';

export const KioskPage: React.FC = () => {
  const { isAdmin } = useAuthContext();
  const { companyName } = useSettings();
  const [token, setToken] = useState<string | null>(() => kioskService.getStoredToken());

  if (!token) {
    return <KioskActivation isAdmin={isAdmin} onActivated={(t) => setToken(t)} />;
  }
  return <KioskPunch companyName={companyName} onExit={() => { kioskService.clearToken(); setToken(null); }} />;
};

const KioskActivation: React.FC<{ isAdmin: boolean; onActivated: (t: string) => void }> = ({
  isAdmin,
  onActivated,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { token } = await kioskService.createToken();
      kioskService.setStoredToken(token);
      onActivated(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-gradient-to-br from-brand-600 to-brand-800 text-white text-center">
      <div className="max-w-sm space-y-4">
        <Fingerprint className="w-12 h-12 mx-auto opacity-90" />
        <h1 className="text-2xl font-bold">Modo kiosco</h1>
        {isAdmin ? (
          <>
            <p className="opacity-80">Activa este dispositivo como punto de fichaje. Quedará listo para que los empleados fichen con su PIN o QR.</p>
            {error && <p className="text-rose-200 text-sm">{error}</p>}
            <Button variant="secondary" size="lg" block loading={loading} onClick={activate}>
              Activar este dispositivo
            </Button>
          </>
        ) : (
          <p className="opacity-80">
            Este dispositivo no está activado. Pide a un administrador que inicie sesión y lo active
            desde aquí.
          </p>
        )}
        <Link to="/login" className="inline-block text-sm text-white/70 underline">Ir al inicio de sesión</Link>
      </div>
    </div>
  );
};

const KioskPunch: React.FC<{ companyName: string | null; onExit: () => void }> = ({
  companyName,
  onExit,
}) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KioskPunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  const stopScan = useCallback(() => {
    scanningRef.current = false;
    setScanning(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const submit = useCallback(async (value: string) => {
    if (value.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await kioskService.punch(value);
      setResult(res);
      setCode('');
      setTimeout(() => setResult(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setCode('');
      setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const startScan = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      scanningRef.current = true;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const tick = () => {
        if (!scanningRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;
        if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const qr = jsQR(img.data, img.width, img.height);
            const val = qr?.data.trim() ?? '';
            if (/^\d{4,8}$/.test(val)) {
              stopScan();
              void submit(val);
              return;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setError('No se pudo acceder a la cámara');
      stopScan();
    }
  }, [stopScan, submit]);

  useEffect(() => () => stopScan(), [stopScan]);

  const press = (d: string) => setCode((c) => (c.length < 8 ? c + d : c));
  const back = () => setCode((c) => c.slice(0, -1));

  // Pantalla de resultado (entrada/salida) o error a pantalla casi completa
  if (result) {
    const isIn = result.action === 'check_in';
    return (
      <div className={'min-h-screen grid place-items-center p-6 text-white text-center ' + (isIn ? 'bg-emerald-600' : 'bg-slate-700')}>
        <div className="space-y-3">
          {isIn ? <LogIn className="w-16 h-16 mx-auto" /> : <LogOut className="w-16 h-16 mx-auto" />}
          <h1 className="text-3xl font-bold">¡Hola, {result.employee_name}!</h1>
          <p className="text-xl opacity-90">
            {isIn ? 'Entrada' : 'Salida'} registrada a las {formatTime(result.time)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white">
      <div className="w-full max-w-xs">
        <div className="text-center mb-5">
          <p className="text-sm text-white/50">{companyName ?? 'nuxoasist'}</p>
          <h1 className="text-xl font-bold">Introduce tu PIN</h1>
        </div>

        {/* PIN como puntos */}
        <div className="flex justify-center gap-2 h-6 mb-4">
          {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
            <span key={i} className={'w-3 h-3 rounded-full ' + (i < code.length ? 'bg-white' : 'bg-white/25')} />
          ))}
        </div>

        {error && <p className="text-center text-rose-300 text-sm mb-3">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold active:scale-95 transition"
            >
              {d}
            </button>
          ))}
          <button onClick={back} className="h-16 rounded-2xl bg-white/5 hover:bg-white/15 grid place-items-center">
            <Delete className="w-6 h-6" />
          </button>
          <button onClick={() => press('0')} className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-semibold active:scale-95 transition">0</button>
          <button
            onClick={() => submit(code)}
            disabled={code.length < 4 || busy}
            className="h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 grid place-items-center disabled:opacity-40"
          >
            <Check className="w-7 h-7" />
          </button>
        </div>

        <button onClick={startScan} className="mt-5 w-full flex items-center justify-center gap-2 text-white/70 hover:text-white py-2">
          <QrCode className="w-5 h-5" /> Escanear QR
        </button>
      </div>

      <button onClick={onExit} className="absolute bottom-4 right-4 text-xs text-white/30 hover:text-white/60">
        Salir del modo kiosco
      </button>

      {/* Overlay de cámara para QR */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <video ref={videoRef} className="max-h-[70vh] w-auto rounded-2xl" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <p className="text-white/70 mt-4">Apunta al código QR…</p>
          <button onClick={stopScan} className="mt-4 inline-flex items-center gap-2 text-white bg-white/10 rounded-xl px-4 py-2">
            <X className="w-5 h-5" /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
};
