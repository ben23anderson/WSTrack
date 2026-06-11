import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QrScanner from 'qr-scanner';
import Layout from '../components/Layout.js';
import { ApiError } from '../api/client.js';
import { getHeats } from '../api/seeding.js';
import type { HeatData } from '../api/seeding.js';
import { recordFinish, deleteFinish } from '../api/officiating.js';

type ScanMode = 'pre_final' | 'final_pass';

interface ScanRecord {
  boatNumber: string;
  clientFinishTs: number;
  sequence: number;
  serverEventId?: string;
  isManual?: boolean;
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const secs = ms / 1000;
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}:${s.toFixed(2).padStart(5, '0')}`;
}

function OverrideModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (boatNumber: string, ts: number) => void;
}) {
  const [boatNumber, setBoatNumber] = useState('');
  const [inputError, setInputError] = useState('');

  function handleSubmit() {
    const bn = boatNumber.trim();
    if (!bn) { setInputError('Enter a boat number'); return; }
    onSubmit(bn, Date.now());
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4 mb-safe">
        <h3 className="font-semibold text-gray-900 text-lg">Manual Override</h3>
        <p className="text-sm text-gray-600">Record a finish for a missed or blocked QR scan.</p>
        <input
          type="text"
          inputMode="numeric"
          value={boatNumber}
          onChange={(e) => { setBoatNumber(e.target.value); setInputError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Boat number"
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-3 text-2xl text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {inputError && <p className="text-red-600 text-xs">{inputError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-3 text-sm"
          >
            Record Now
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-3 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QRScannerPage() {
  const { heatId } = useParams<{ heatId: string }>();
  const [searchParams] = useSearchParams();
  const raceIdFromParams = searchParams.get('raceId');

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  // Deduplication: map of boatNumber → last scan epoch ms
  const lastScanTimeRef = useRef<Map<string, number>>(new Map());
  const sequenceRef = useRef(0);
  // Always-current refs so the scanner callback can read state without stale closures
  const modeRef = useRef<ScanMode>('pre_final');
  const finishesRef = useRef<ScanRecord[]>([]);

  const [mode, setMode] = useState<ScanMode>('pre_final');
  const [heatData, setHeatData] = useState<HeatData | null>(null);
  // Pre-final: map of boatNumber → last seen epoch ms (display only)
  const [preFinalSights, setPreFinalSights] = useState<Map<string, number>>(new Map());
  // Final pass: ordered finish records
  const [finishes, setFinishes] = useState<ScanRecord[]>([]);
  const [showOverride, setShowOverride] = useState(false);
  const [flashBoat, setFlashBoat] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState('');

  // Keep refs in sync with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { finishesRef.current = finishes; }, [finishes]);

  const heatsQuery = useQuery<{ heats: HeatData[] }, ApiError>({
    queryKey: ['heats', raceIdFromParams],
    queryFn: () => getHeats(raceIdFromParams!),
    enabled: !!raceIdFromParams,
  });

  useEffect(() => {
    if (heatsQuery.data && heatId) {
      const found = heatsQuery.data.heats.find((h) => h.id === heatId);
      if (found) setHeatData(found);
    }
  }, [heatsQuery.data, heatId]);

  const flashEffect = useCallback((boatNumber: string) => {
    setFlashBoat(boatNumber);
    setTimeout(() => setFlashBoat(null), 700);
  }, []);

  // Stable scan handler that reads current state via refs
  const handleScan = useCallback(async (data: string) => {
    const boatNumber = data.trim();
    if (!boatNumber) return;

    const now = Date.now();
    const lastScan = lastScanTimeRef.current.get(boatNumber) ?? 0;
    // Suppress rapid re-detections of the same QR still in frame
    // In pre_final we use a longer window since we just want "was it seen"
    const debounceMs = modeRef.current === 'pre_final' ? 3000 : 800;
    if (now - lastScan < debounceMs) return;

    lastScanTimeRef.current.set(boatNumber, now);
    flashEffect(boatNumber);

    if (modeRef.current === 'pre_final') {
      setPreFinalSights((prev) => {
        const next = new Map(prev);
        next.set(boatNumber, now);
        return next;
      });
      return;
    }

    // ── Final pass: record the finish ────────────────────────────────────────
    const clientFinishTs = now;
    const sequence = sequenceRef.current++;

    // Check if this boat was already recorded (late boat crossing again)
    const existing = finishesRef.current.find((f) => f.boatNumber === boatNumber);
    if (existing?.serverEventId) {
      // Delete the old server event — this crossing is later, so it's the real finish
      void deleteFinish(heatId!, existing.serverEventId).catch(() => {});
    }

    const newRecord: ScanRecord = { boatNumber, clientFinishTs, sequence };

    setFinishes((prev) =>
      [...prev.filter((f) => f.boatNumber !== boatNumber), newRecord].sort(
        (a, b) => a.clientFinishTs - b.clientFinishTs
      )
    );

    // Persist to server
    try {
      const result = await recordFinish(heatId!, {
        boat_number: boatNumber,
        client_finish_ts: clientFinishTs,
        sequence,
      });
      const serverId = result.event.id;
      setFinishes((prev) =>
        prev.map((f) =>
          f.boatNumber === boatNumber && f.clientFinishTs === clientFinishTs
            ? { ...f, serverEventId: serverId }
            : f
        )
      );
    } catch {
      // Local record is kept; "saving…" badge stays until refresh
    }
  }, [heatId, flashEffect]);

  // Stable ref so the QrScanner callback (set up once) always calls current handler
  const handleScanRef = useRef(handleScan);
  useEffect(() => { handleScanRef.current = handleScan; }, [handleScan]);

  // Initialize QR scanner once on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let scanner: QrScanner;
    try {
      scanner = new QrScanner(
        video,
        (result: QrScanner.ScanResult) => { void handleScanRef.current(result.data); },
        {
          preferredCamera: 'environment',
          maxScansPerSecond: 30,
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      );
      scannerRef.current = scanner;
      scanner.start().catch((err: unknown) => {
        setCameraError(err instanceof Error ? err.message : String(err));
      });
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
    }

    return () => {
      scanner?.destroy();
      scannerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMarkFinalPass() {
    setMode('final_pass');
    setFinishes([]);
    sequenceRef.current = 0;
    lastScanTimeRef.current.clear();
  }

  function handleDeleteFinish(record: ScanRecord) {
    setFinishes((prev) => prev.filter((f) => f.boatNumber !== record.boatNumber));
    if (record.serverEventId) {
      void deleteFinish(heatId!, record.serverEventId).catch(() => {});
    }
  }

  async function handleOverrideSubmit(boatNumber: string, ts: number) {
    const sequence = sequenceRef.current++;
    const newRecord: ScanRecord = { boatNumber, clientFinishTs: ts, sequence, isManual: true };

    // Remove any existing entry for this boat
    const existing = finishesRef.current.find((f) => f.boatNumber === boatNumber);
    if (existing?.serverEventId) {
      void deleteFinish(heatId!, existing.serverEventId).catch(() => {});
    }

    setFinishes((prev) =>
      [...prev.filter((f) => f.boatNumber !== boatNumber), newRecord].sort(
        (a, b) => a.clientFinishTs - b.clientFinishTs
      )
    );

    try {
      const result = await recordFinish(heatId!, {
        boat_number: boatNumber,
        client_finish_ts: ts,
        sequence,
      });
      const serverId = result.event.id;
      setFinishes((prev) =>
        prev.map((f) =>
          f.boatNumber === boatNumber && f.clientFinishTs === ts
            ? { ...f, serverEventId: serverId }
            : f
        )
      );
    } catch {
      // kept locally
    }
  }

  const heatStartTs = heatData?.startTs ? new Date(heatData.startTs).getTime() : null;

  return (
    <Layout>
      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              QR Scanner — Heat {heatData?.heatNumber ?? '…'}
            </h1>
            {heatData?.startTs ? (
              <p className="text-xs text-gray-500 mt-0.5">Heat in progress</p>
            ) : (
              <p className="text-xs text-amber-600 mt-0.5">Heat not yet started — times will still be recorded</p>
            )}
          </div>
          <Link
            to={`/heats/${heatId}/officiate?${searchParams.toString()}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Standard view →
          </Link>
        </div>

        {/* Camera feed */}
        <div className="relative bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-6 space-y-2">
              <p className="text-base font-semibold">Camera unavailable</p>
              <p className="text-sm text-gray-400">{cameraError}</p>
              <p className="text-xs text-gray-500">Grant camera permission and reload. HTTPS required on non-localhost.</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Flash overlay when QR detected */}
              {flashBoat && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-green-500/90 text-white px-8 py-4 rounded-2xl text-4xl font-black shadow-xl">
                    #{flashBoat}
                  </div>
                </div>
              )}

              {/* Mode badge overlay */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow ${
                  mode === 'pre_final'
                    ? 'bg-amber-400 text-amber-900'
                    : 'bg-green-500 text-white'
                }`}>
                  {mode === 'pre_final' ? 'Watching · Pre-Final' : '● Recording Final Pass'}
                </span>
                {mode === 'pre_final' && preFinalSights.size > 0 && (
                  <span className="text-xs bg-black/50 text-white px-2 py-1 rounded-full">
                    {preFinalSights.size} boat{preFinalSights.size !== 1 ? 's' : ''} spotted
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          {mode === 'pre_final' ? (
            <button
              onClick={handleMarkFinalPass}
              className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-xl px-4 py-3.5 text-sm transition-colors"
            >
              Mark Final Pass — Start Recording
            </button>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-green-50 border border-green-200 rounded-xl px-4 py-3.5">
              <span className="text-sm font-medium text-green-800">● Recording Final Pass</span>
            </div>
          )}
          <button
            onClick={() => setShowOverride(true)}
            className="bg-orange-100 hover:bg-orange-200 active:bg-orange-300 text-orange-800 font-medium rounded-xl px-4 py-3.5 text-sm transition-colors"
          >
            Override
          </button>
        </div>

        {/* Pre-final sightings */}
        {mode === 'pre_final' && preFinalSights.size > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-800 mb-2 uppercase tracking-wide">
              Boats spotted this pass
            </p>
            <div className="flex flex-wrap gap-2">
              {[...preFinalSights.entries()]
                .sort(([, a], [, b]) => a - b)
                .map(([bn]) => (
                  <span
                    key={bn}
                    className="bg-amber-200 text-amber-900 text-sm font-mono font-semibold px-2.5 py-1 rounded-lg"
                  >
                    #{bn}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Final pass — finish order */}
        {mode === 'final_pass' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                Finish order{finishes.length > 0 ? ` · ${finishes.length} recorded` : ''}
              </p>
            </div>

            {finishes.length === 0 && (
              <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl py-10 text-center text-gray-400 text-sm">
                Awaiting first QR scan…
              </div>
            )}

            {finishes.map((f, i) => (
              <div
                key={f.boatNumber}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
              >
                {/* Place */}
                <span className="text-xl font-black text-gray-300 w-8 text-right flex-shrink-0">
                  {i + 1}
                </span>

                {/* Boat number */}
                <span className="text-xl font-bold text-gray-900 font-mono flex-1">
                  #{f.boatNumber}
                </span>

                {/* Badges */}
                <div className="flex items-center gap-1.5">
                  {f.isManual && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                      manual
                    </span>
                  )}
                  {!f.serverEventId && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                      saving…
                    </span>
                  )}
                </div>

                {/* Time + remove */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {heatStartTs && (
                    <span className="text-sm text-gray-500 font-mono tabular-nums">
                      {formatElapsed(f.clientFinishTs - heatStartTs)}
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteFinish(f)}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="text-xs text-gray-400 space-y-0.5 pt-1">
          <p>• QR codes should contain only the boat number (e.g. <span className="font-mono">42</span>).</p>
          <p>• Press <strong>Override</strong> for any boat whose QR was blocked or missed.</p>
          <p>• In multi-pass races, press <strong>Mark Final Pass</strong> when boats begin their last lap. Late boats scanned a second time will update their finish time.</p>
        </div>
      </div>

      {showOverride && (
        <OverrideModal
          onClose={() => setShowOverride(false)}
          onSubmit={(bn, ts) => { void handleOverrideSubmit(bn, ts); }}
        />
      )}
    </Layout>
  );
}
