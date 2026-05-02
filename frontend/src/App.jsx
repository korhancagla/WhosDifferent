import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Check,
  Copy,
  Crown,
  Eraser,
  LogIn,
  Palette,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';

const host = window.location.hostname || 'localhost';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${host}:3001`;

const colorSwatches = ['#111827', '#e11d48', '#0f766e', '#2563eb', '#f59e0b', '#7c3aed'];

const phaseMeta = {
  lobby: { label: 'Bekleme', tone: 'border-slate-600 bg-slate-800 text-slate-100' },
  drawing: { label: 'Çizim', tone: 'border-teal-500 bg-teal-950 text-teal-100' },
  voting: { label: 'Oylama', tone: 'border-amber-500 bg-amber-950 text-amber-100' },
  result: { label: 'Sonuç', tone: 'border-rose-500 bg-rose-950 text-rose-100' },
};

function uniqWords(words) {
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))];
}

function playerInitial(name = '?') {
  return name.trim().slice(0, 1).toLocaleUpperCase('tr-TR') || '?';
}

function Panel({ className = '', children }) {
  return (
    <section className={`rounded-lg border border-slate-700 bg-slate-900/82 shadow-xl shadow-black/20 ${className}`}>
      {children}
    </section>
  );
}

function App() {
  const [connection, setConnection] = useState('connecting');
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('kim_farkli_name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [wordDrafts, setWordDrafts] = useState(['', '', '', '']);
  const [mainWord, setMainWord] = useState('');
  const [differentWord, setDifferentWord] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(5);

  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const drawingHistoryRef = useRef([]);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const hasMovedRef = useRef(false);
  const toastTimerRef = useRef(null);

  const isHost = !!room?.me?.isHost;
  const phase = room?.phase || 'lobby';
  const phaseInfo = phaseMeta[phase] || phaseMeta.lobby;
  const wordOptions = useMemo(() => uniqWords(wordDrafts), [wordDrafts]);
  const canStart = isHost && phase === 'lobby' && room?.players?.length >= 2 && mainWord && differentWord && mainWord !== differentWord;
  const canDraw = phase === 'drawing' && !!room?.me?.word;

  const showToast = useCallback((message) => {
    clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const emitSocket = useCallback((eventName, payload) => {
    const currentSocket = socketRef.current;
    if (!currentSocket) return;
    if (payload === undefined) currentSocket.emit(eventName);
    else currentSocket.emit(eventName, payload);
  }, []);

  const clearCanvasSurface = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.restore();
  }, []);

  const drawOperation = useCallback((op) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const fromX = op.from.x * rect.width;
    const fromY = op.from.y * rect.height;
    const toX = op.to.x * rect.width;
    const toY = op.to.y * rect.height;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = op.size;
    ctx.globalCompositeOperation = op.mode === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = op.color;
    ctx.fillStyle = op.color;

    if (Math.abs(fromX - toX) < 0.2 && Math.abs(fromY - toY) < 0.2) {
      ctx.beginPath();
      ctx.arc(toX, toY, op.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  const replayCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);

    clearCanvasSurface();
    drawingHistoryRef.current.forEach(drawOperation);
  }, [clearCanvasSurface, drawOperation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const observer = new ResizeObserver(() => replayCanvas());
    observer.observe(canvas);
    window.addEventListener('resize', replayCanvas);
    requestAnimationFrame(replayCanvas);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', replayCanvas);
    };
  }, [phase, replayCanvas, room?.code]);

  useEffect(() => {
    const nextSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = nextSocket;

    nextSocket.on('connect', () => setConnection('connected'));
    nextSocket.on('disconnect', () => setConnection('disconnected'));
    nextSocket.on('connect_error', () => setConnection('error'));

    nextSocket.on('room-state', (nextRoom) => {
      setRoom(nextRoom);
      setError('');
      if (nextRoom.hostSetup) {
        const nextWords = [...nextRoom.hostSetup.words];
        while (nextWords.length < 4) nextWords.push('');
        setWordDrafts(nextWords.slice(0, 6));
        setMainWord(nextRoom.hostSetup.mainWord || '');
        setDifferentWord(nextRoom.hostSetup.differentWord || '');
      }
    });

    nextSocket.on('drawing-history', (ops) => {
      drawingHistoryRef.current = Array.isArray(ops) ? ops : [];
      requestAnimationFrame(replayCanvas);
    });

    nextSocket.on('draw-op', (op) => {
      drawingHistoryRef.current.push(op);
      drawOperation(op);
    });

    nextSocket.on('canvas-cleared', () => {
      drawingHistoryRef.current = [];
      clearCanvasSurface();
    });

    nextSocket.on('room-message', showToast);
    nextSocket.on('action-error', setError);

    return () => {
      clearTimeout(toastTimerRef.current);
      nextSocket.disconnect();
      socketRef.current = null;
    };
  }, [clearCanvasSurface, drawOperation, replayCanvas, showToast]);

  const runWithAck = (eventName, payload) => {
    const currentSocket = socketRef.current;
    if (!currentSocket || connection !== 'connected') {
      setError('Sunucu bağlantısı hazır değil.');
      return;
    }

    currentSocket.emit(eventName, payload, (response) => {
      if (!response?.ok) {
        setError(response?.error || 'İşlem tamamlanamadı.');
        return;
      }
      localStorage.setItem('kim_farkli_name', playerName.trim());
      setJoinCode(response.code || joinCode);
    });
  };

  const handleCreateRoom = (event) => {
    event.preventDefault();
    const name = playerName.trim();
    if (!name) {
      setError('Oyuncu adını yazmalısın.');
      return;
    }
    runWithAck('create-room', { name });
  };

  const handleJoinRoom = (event) => {
    event.preventDefault();
    const name = playerName.trim();
    const code = joinCode.trim();
    if (!name || !code) {
      setError('Oyuncu adı ve oda kodu gerekli.');
      return;
    }
    runWithAck('join-room', { name, code });
  };

  const handleSaveWords = () => {
    emitSocket('update-words', { words: wordDrafts, mainWord, differentWord });
    showToast('Kelime ayarları kaydedildi.');
  };

  const handleStartGame = () => {
    emitSocket('update-words', { words: wordDrafts, mainWord, differentWord });
    emitSocket('start-game');
  };

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  };

  const emitDraw = (op) => {
    drawingHistoryRef.current.push(op);
    drawOperation(op);
    emitSocket('draw', op);
  };

  const handlePointerDown = (event) => {
    if (!canDraw) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    hasMovedRef.current = false;
    lastPointRef.current = getCanvasPoint(event);
  };

  const handlePointerMove = (event) => {
    if (!isDrawingRef.current || !canDraw) return;
    event.preventDefault();
    const nextPoint = getCanvasPoint(event);
    const lastPoint = lastPointRef.current || nextPoint;
    const dx = nextPoint.x - lastPoint.x;
    const dy = nextPoint.y - lastPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) < 0.002) return;

    hasMovedRef.current = true;
    const op = {
      from: lastPoint,
      to: nextPoint,
      color,
      size: Number(size),
      mode: tool,
    };
    emitDraw(op);
    lastPointRef.current = nextPoint;
  };

  const stopDrawing = (event) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    if (!hasMovedRef.current) {
      emitDraw({ from: point, to: point, color, size: Number(size), mode: tool });
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* Pointer capture may already be released by the browser. */
    }
  };

  const copyRoomCode = async () => {
    if (!room?.code) return;
    await navigator.clipboard?.writeText(room.code);
    showToast('Oda kodu kopyalandı.');
  };

  const voteTargetName = (targetId) => room?.players?.find((player) => player.id === targetId)?.name || '';

  if (!room) {
    return (
      <div className="min-h-screen bg-[#101820] text-slate-100">
        <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8">
          <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-950/60 px-3 py-1 text-sm font-semibold text-teal-100">
                <Palette className="h-4 w-4" />
                Ortak canvas blöf oyunu
              </div>
              <div>
                <h1 className="text-5xl font-black tracking-normal text-white sm:text-7xl">Kim Farklı?</h1>
                <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
                  Herkes aynı alana çizer, sadece bir kişinin kelimesi farklıdır. Çizgilerin arasındaki blöfü yakala.
                </p>
              </div>
              <div className="grid max-w-xl grid-cols-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/70 text-center">
                <div className="px-4 py-4">
                  <div className="text-2xl font-black text-teal-300">1</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Oda</div>
                </div>
                <div className="border-x border-slate-700 px-4 py-4">
                  <div className="text-2xl font-black text-amber-300">2</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Kelime</div>
                </div>
                <div className="px-4 py-4">
                  <div className="text-2xl font-black text-rose-300">3</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Oy</div>
                </div>
              </div>
            </div>

            <Panel className="p-5 sm:p-6">
              <form className="space-y-5" onSubmit={handleJoinRoom}>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">Oyuncu adı</label>
                  <input
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    maxLength={24}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-teal-400"
                    placeholder="Örn: Deniz"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">Oda kodu</label>
                  <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    maxLength={16}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-white outline-none transition focus:border-amber-400"
                    placeholder="K7P9"
                  />
                </div>

                {error && <div className="rounded-lg border border-rose-500/50 bg-rose-950/60 px-3 py-2 text-sm text-rose-100">{error}</div>}
                {connection === 'error' && <div className="rounded-lg border border-amber-500/50 bg-amber-950/60 px-3 py-2 text-sm text-amber-100">Backend sunucusuna bağlanılamadı.</div>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    disabled={connection !== 'connected'}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-3 font-black text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-5 w-5" />
                    Oda Kur
                  </button>
                  <button
                    type="submit"
                    disabled={connection !== 'connected'}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LogIn className="h-5 w-5" />
                    Odaya Katıl
                  </button>
                </div>
                <div className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {connection === 'connected' ? 'Sunucu hazır' : 'Bağlanıyor'}
                </div>
              </form>
            </Panel>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#101820] text-slate-100">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg border border-teal-300/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-teal-100 shadow-2xl">
          {toast}
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#101820]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-400 text-slate-950">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-black text-white">Kim Farklı?</div>
              <button onClick={copyRoomCode} className="inline-flex items-center gap-1 font-mono text-sm font-bold text-amber-200">
                {room.code}
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`rounded-full border px-3 py-1 text-sm font-black ${phaseInfo.tone}`}>{phaseInfo.label}</div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-bold text-slate-200">
              <Users className="h-4 w-4" />
              {room.players.length}
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-7xl px-4">
          <div className="rounded-lg border border-rose-500/50 bg-rose-950/60 px-4 py-3 text-sm font-semibold text-rose-100">{error}</div>
        </div>
      )}

      {phase === 'lobby' ? (
        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[300px_1fr]">
          <PlayerPanel room={room} />
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-black text-white">Oda Bekliyor</h2>
                <p className="mt-1 text-sm text-slate-400">Host kelimeleri seçtiğinde tur başlatılabilir.</p>
              </div>
              {isHost && (
                <button
                  onClick={handleStartGame}
                  disabled={!canStart}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-400 px-4 py-3 font-black text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-5 w-5" />
                  Oyunu Başlat
                </button>
              )}
            </div>

            {isHost ? (
              <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {wordDrafts.map((word, index) => (
                    <label key={index} className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-300">Kelime {index + 1}</span>
                      <input
                        value={word}
                        onChange={(event) => {
                          const next = [...wordDrafts];
                          next[index] = event.target.value;
                          setWordDrafts(next);
                        }}
                        maxLength={32}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-teal-400"
                        placeholder="Örn: Gitar"
                      />
                    </label>
                  ))}
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-300">Ana kelime</span>
                    <select
                      value={mainWord}
                      onChange={(event) => setMainWord(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-teal-400"
                    >
                      <option value="">Seç</option>
                      {wordOptions.map((word) => <option key={word} value={word}>{word}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-300">Farklı kelime</span>
                    <select
                      value={differentWord}
                      onChange={(event) => setDifferentWord(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400"
                    >
                      <option value="">Seç</option>
                      {wordOptions.map((word) => <option key={word} value={word}>{word}</option>)}
                    </select>
                  </label>
                  <button
                    onClick={handleSaveWords}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 font-bold text-slate-100 transition hover:bg-slate-700"
                  >
                    <Check className="h-5 w-5" />
                    Kelimeleri Kaydet
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-10 flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50 text-center">
                <div>
                  <Crown className="mx-auto h-10 w-10 text-amber-300" />
                  <p className="mt-3 max-w-sm text-slate-300">Host kelimeleri seçiyor. Oyun başladığında kendi gizli kelimen burada görünecek.</p>
                </div>
              </div>
            )}
          </Panel>
        </main>
      ) : (
        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 xl:grid-cols-[270px_1fr_330px]">
          <PlayerPanel room={room} />

          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Senin kelimen</div>
                <div className="mt-1 text-2xl font-black text-amber-200">{room.me?.word || 'Bekleniyor'}</div>
              </div>
              {isHost && phase === 'drawing' && (
                <button
                  onClick={() => emitSocket('go-to-voting')}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-3 font-black text-slate-950 transition hover:bg-amber-300"
                >
                  <Vote className="h-5 w-5" />
                  Oylamaya Geç
                </button>
              )}
            </div>

            <div className="relative bg-stone-50">
              <canvas
                ref={canvasRef}
                className={`block h-[min(64vh,680px)] min-h-[360px] w-full touch-none ${canDraw ? 'cursor-crosshair' : 'cursor-default'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                onPointerLeave={(event) => {
                  if (isDrawingRef.current) stopDrawing(event);
                }}
              />
              {!canDraw && phase !== 'result' && (
                <div className="pointer-events-none absolute inset-x-4 top-4 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-center text-sm font-bold text-slate-700 shadow">
                  {phase === 'voting' ? 'Çizim kilitlendi. Oylar bekleniyor.' : 'Canvas tur başlayınca açılır.'}
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            {phase === 'drawing' && (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Araçlar</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTool('pen')}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 font-bold ${tool === 'pen' ? 'bg-teal-400 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                    >
                      <Pencil className="h-5 w-5" />
                      Kalem
                    </button>
                    <button
                      onClick={() => setTool('eraser')}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 font-bold ${tool === 'eraser' ? 'bg-amber-300 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                    >
                      <Eraser className="h-5 w-5" />
                      Silgi
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Renk</div>
                  <div className="flex flex-wrap gap-2">
                    {colorSwatches.map((swatch) => (
                      <button
                        key={swatch}
                        onClick={() => setColor(swatch)}
                        title={swatch}
                        className={`h-9 w-9 rounded-full border-2 ${color === swatch ? 'border-white' : 'border-slate-700'}`}
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                    <input
                      aria-label="Özel renk"
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                      className="h-9 w-12 rounded-lg border border-slate-700 bg-slate-800 p-1"
                    />
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-black uppercase tracking-widest text-slate-500">Kalınlık</span>
                  <input
                    type="range"
                    min="2"
                    max="36"
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                    className="w-full accent-teal-400"
                  />
                  <div className="mt-2 text-sm font-bold text-slate-300">{size}px</div>
                </label>

                {isHost && (
                  <button
                    onClick={() => emitSocket('clear-canvas')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-700 bg-rose-950 px-4 py-3 font-bold text-rose-100 transition hover:bg-rose-900"
                  >
                    <Trash2 className="h-5 w-5" />
                    Canvas Temizle
                  </button>
                )}
              </div>
            )}

            {phase === 'voting' && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-black uppercase tracking-widest text-slate-500">Sence kim farklı?</div>
                  {room.me?.votedFor && <p className="mt-2 text-sm font-semibold text-amber-200">Oyun alındı: {voteTargetName(room.me.votedFor)}</p>}
                </div>
                <div className="grid gap-2">
                  {room.players.filter((player) => player.id !== room.me?.id).map((player) => (
                    <button
                      key={player.id}
                      disabled={!!room.me?.votedFor}
                      onClick={() => emitSocket('submit-vote', player.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        room.me?.votedFor === player.id
                          ? 'border-amber-300 bg-amber-950 text-amber-100'
                          : 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                      }`}
                    >
                      <span className="font-bold">{player.name}</span>
                      {room.me?.votedFor === player.id ? <Check className="h-5 w-5" /> : <Send className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
                {isHost && (
                  <button
                    onClick={() => emitSocket('reveal-results')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-3 font-black text-white transition hover:bg-rose-400"
                  >
                    <Trophy className="h-5 w-5" />
                    Sonuçları Aç
                  </button>
                )}
              </div>
            )}

            {phase === 'result' && (
              <ResultPanel room={room} isHost={isHost} onNewRound={() => emitSocket('new-round')} />
            )}
          </Panel>
        </main>
      )}
    </div>
  );
}

function PlayerPanel({ room }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black text-white">Oyuncular</h2>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-slate-300">{room.players.length}</span>
      </div>
      <div className="space-y-2">
        {room.players.map((player, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
              room.result?.differentPlayerId === player.id
                ? 'border-rose-400 bg-rose-950/60'
                : player.id === room.me?.id
                  ? 'border-teal-400/70 bg-teal-950/35'
                  : 'border-slate-700 bg-slate-800/70'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 font-black text-slate-200">
                {playerInitial(player.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-100">
                  {player.name}
                  {player.id === room.me?.id ? ' (Sen)' : ''}
                </div>
                <div className="text-xs font-semibold text-slate-500">Oyuncu {index + 1}</div>
              </div>
            </div>
            <div className="ml-3 flex items-center gap-2">
              {player.isHost && <Crown className="h-4 w-4 text-amber-300" />}
              {room.phase === 'voting' && player.hasVoted && <Check className="h-4 w-4 text-teal-300" />}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ResultPanel({ room, isHost, onNewRound }) {
  const counts = room.result?.voteCounts || {};
  const winnerText = room.result?.winner === 'majority'
    ? 'Çoğunluk farklı oyuncuyu buldu.'
    : 'Farklı kelimeye sahip oyuncu yakalanmadı.';

  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/50 bg-rose-950 px-3 py-1 text-sm font-black text-rose-100">
          <Trophy className="h-4 w-4" />
          {room.result?.winner === 'majority' ? 'Çoğunluk Kazandı' : 'Farklı Oyuncu Kazandı'}
        </div>
        <h2 className="mt-4 text-2xl font-black text-white">{winnerText}</h2>
      </div>

      <div className="grid gap-3">
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
          <div className="text-xs font-black uppercase tracking-widest text-slate-500">Farklı oyuncu</div>
          <div className="mt-1 text-lg font-black text-rose-200">{room.result?.differentPlayerName}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-lg border border-teal-600/50 bg-teal-950/60 px-3 py-3">
            <div className="text-xs font-black uppercase tracking-widest text-teal-300/70">Ana kelime</div>
            <div className="mt-1 text-lg font-black text-teal-100">{room.result?.mainWord}</div>
          </div>
          <div className="rounded-lg border border-amber-500/50 bg-amber-950/60 px-3 py-3">
            <div className="text-xs font-black uppercase tracking-widest text-amber-300/70">Farklı kelime</div>
            <div className="mt-1 text-lg font-black text-amber-100">{room.result?.differentWord}</div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Oy dağılımı</div>
        <div className="space-y-2">
          {room.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              <span className="font-bold text-slate-200">{player.name}</span>
              <span className="font-mono text-lg font-black text-amber-200">{counts[player.id] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Oylar</div>
        <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
          {(room.result?.votes || []).length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-400">Oy verilmedi.</div>
          ) : (
            room.result.votes.map((vote) => (
              <div key={vote.voterId} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
                <span className="font-bold text-slate-100">{vote.voterName}</span>
                <span className="text-slate-500"> oy verdi: </span>
                <span className="font-bold text-amber-200">{vote.targetName}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {isHost && (
        <button
          onClick={onNewRound}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-400 px-4 py-3 font-black text-slate-950 transition hover:bg-teal-300"
        >
          <RotateCcw className="h-5 w-5" />
          Yeni Tur Başlat
        </button>
      )}
    </div>
  );
}

export default App;
