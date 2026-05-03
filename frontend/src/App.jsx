import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Check,
  Clock,
  Copy,
  Crown,
  Eraser,
  Eye,
  History,
  LogIn,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Vote,
  Zap,
} from 'lucide-react';
import VisualScene from './VisualScene.jsx';

const host = window.location.hostname || 'localhost';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${host}:3001`;
const CLIENT_ID_KEY = 'kim_farkli_client_id';
const NAME_KEY = 'kim_farkli_name';

const phaseMeta = {
  lobby: { label: 'Bekleme', tone: 'border-slate-600 bg-slate-800 text-slate-100' },
  drawing: { label: 'Çizim', tone: 'border-teal-500 bg-teal-950 text-teal-100' },
  voting: { label: 'Oylama', tone: 'border-amber-500 bg-amber-950 text-amber-100' },
  result: { label: 'Sonuç', tone: 'border-rose-500 bg-rose-950 text-rose-100' },
};

function getClientId() {
  const existing = sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

function formatTime(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function midpointBetween(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function playerInitial(name = '?') {
  return name.trim().slice(0, 1).toLocaleUpperCase('tr-TR') || '?';
}

function Panel({ className = '', children }) {
  return (
    <section className={`rounded-lg border border-slate-700 bg-slate-900/88 shadow-xl shadow-black/20 ${className}`}>
      {children}
    </section>
  );
}

function useSound() {
  const contextRef = useRef(null);
  const [muted, setMuted] = useState(false);

  const play = useCallback((cue) => {
    if (muted) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!contextRef.current) contextRef.current = new AudioContext();
    const ctx = contextRef.current;
    ctx.resume?.();

    const map = {
      start: [440, 660, 0.11],
      vote: [330, 495, 0.1],
      result: [220, 740, 0.22],
      tick: [900, 900, 0.035],
      ready: [520, 620, 0.08],
    };
    const [from, to, duration] = map[cue] || map.ready;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = cue === 'result' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }, [muted]);

  return { muted, setMuted, play };
}

export default function App() {
  const [connection, setConnection] = useState('connecting');
  const [room, setRoom] = useState(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tool, setTool] = useState('pen');
  const [size, setSize] = useState(5);
  const [guess, setGuess] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [localCanUndo, setLocalCanUndo] = useState(false);
  const [showRoundIntro, setShowRoundIntro] = useState(false);

  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const clientIdRef = useRef(getClientId());
  const roomRef = useRef(null);
  const drawingHistoryRef = useRef([]);
  const viewportRef = useRef(viewport);
  const activePointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const hasMovedRef = useRef(false);
  const currentStrokeIdRef = useRef('');
  const toastTimerRef = useRef(null);
  const roundIntroTimerRef = useRef(null);
  const previousPhaseRef = useRef('');
  const previousTimeLeftRef = useRef(null);
  const previousTurnIdRef = useRef('');
  const { muted, setMuted, play } = useSound();

  const phase = room?.phase || 'lobby';
  const isHost = !!room?.me?.isHost;
  const phaseInfo = phaseMeta[phase] || phaseMeta.lobby;
  const settings = useMemo(() => room?.settings || {}, [room?.settings]);
  const timer = room?.timer || { timeLeft: 0, total: 0, turn: { timeLeft: 0, total: 0 } };
  const canDraw = !!room?.me?.canDraw;
  const resultIntensity = phase === 'result' ? 'burst' : 'calm';

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const showToast = useCallback((message) => {
    clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(''), 2800);
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

  const normalizeViewport = useCallback((nextViewport) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const scale = clamp(nextViewport.scale, 1, 4);
    if (!rect?.width || !rect?.height || scale === 1) {
      return { scale, offsetX: 0, offsetY: 0 };
    }

    const minX = rect.width - rect.width * scale;
    const minY = rect.height - rect.height * scale;
    return {
      scale,
      offsetX: clamp(nextViewport.offsetX, minX, 0),
      offsetY: clamp(nextViewport.offsetY, minY, 0),
    };
  }, []);

  const applyViewportZoom = useCallback((nextScale, center = null) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;

    setViewport((previous) => {
      const scale = clamp(nextScale, 1, 4);
      const focal = center || { x: rect.width / 2, y: rect.height / 2 };
      const worldX = (focal.x - previous.offsetX) / previous.scale;
      const worldY = (focal.y - previous.offsetY) / previous.scale;
      return normalizeViewport({
        scale,
        offsetX: focal.x - worldX * scale,
        offsetY: focal.y - worldY * scale,
      });
    });
  }, [normalizeViewport]);

  const drawOperation = useCallback((op) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = viewportRef.current;
    const fromX = op.from.x * rect.width * scale + offsetX;
    const fromY = op.from.y * rect.height * scale + offsetY;
    const toX = op.to.x * rect.width * scale + offsetX;
    const toY = op.to.y * rect.height * scale + offsetY;
    const strokeColor = op.playerColor || op.color || '#111827';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = op.size * scale;
    ctx.globalCompositeOperation = op.mode === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;

    if (Math.abs(fromX - toX) < 0.2 && Math.abs(fromY - toY) < 0.2) {
      ctx.beginPath();
      ctx.arc(toX, toY, (op.size * scale) / 2, 0, Math.PI * 2);
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
    viewportRef.current = viewport;
    requestAnimationFrame(replayCanvas);
  }, [viewport, replayCanvas]);

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

    nextSocket.on('connect', () => {
      setConnection('connected');
    });
    nextSocket.on('disconnect', () => setConnection('disconnected'));
    nextSocket.on('connect_error', () => setConnection('error'));

    nextSocket.on('room-state', (nextRoom) => {
      const previousPhase = previousPhaseRef.current;
      const previousTurnId = previousTurnIdRef.current;
      previousPhaseRef.current = nextRoom.phase;
      previousTurnIdRef.current = nextRoom.turn?.currentTurnId || '';
      if (previousTurnId && previousTurnId !== previousTurnIdRef.current) setLocalCanUndo(false);
      setRoom(nextRoom);
      setError('');
      setGuess('');

      if (nextRoom.me?.name) localStorage.setItem(NAME_KEY, nextRoom.me.name);

      if (previousPhase && previousPhase !== nextRoom.phase) {
        if (nextRoom.phase === 'drawing') {
          play('start');
          clearTimeout(roundIntroTimerRef.current);
          setShowRoundIntro(true);
          roundIntroTimerRef.current = setTimeout(() => setShowRoundIntro(false), 3200);
        }
        if (nextRoom.phase === 'voting') play('vote');
        if (nextRoom.phase === 'result') play('result');
      }
      if (nextRoom.phase !== 'drawing') setShowRoundIntro(false);
    });

    nextSocket.on('timer-tick', (nextTimer) => {
      setRoom((previousRoom) => previousRoom ? { ...previousRoom, timer: nextTimer } : previousRoom);
      if (nextTimer.timeLeft <= 5 && nextTimer.timeLeft > 0 && nextTimer.timeLeft !== previousTimeLeftRef.current) {
        play('tick');
      }
      previousTimeLeftRef.current = nextTimer.timeLeft;
    });

    nextSocket.on('drawing-history', (ops) => {
      drawingHistoryRef.current = Array.isArray(ops) ? ops : [];
      const currentRoom = roomRef.current;
      setLocalCanUndo(drawingHistoryRef.current.some((op) => (
        op.playerId === clientIdRef.current && op.turnId === currentRoom?.turn?.currentTurnId
      )));
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
    nextSocket.on('guess-result', () => showToast('Tahmin kaydedildi.'));

    return () => {
      clearTimeout(toastTimerRef.current);
      clearTimeout(roundIntroTimerRef.current);
      nextSocket.disconnect();
      socketRef.current = null;
    };
  }, [clearCanvasSurface, drawOperation, play, replayCanvas, showToast]);

  const runWithAck = (eventName, payload) => {
    const currentSocket = socketRef.current;
    if (!currentSocket || connection !== 'connected') {
      setError('Sunucu bağlantısı hazır değil.');
      return;
    }

    currentSocket.emit(eventName, { ...payload, clientId: clientIdRef.current }, (response) => {
      if (!response?.ok) {
        setError(response?.error || 'İşlem tamamlanamadı.');
        return;
      }
      localStorage.setItem(NAME_KEY, playerName.trim());
      setJoinCode(response.code || joinCode);
      play('ready');
    });
  };

  const handleCreateRoom = (event) => {
    event.preventDefault();
    const name = playerName.trim();
    if (!name) {
      setError('Oyuncu adını yazmalısın.');
      return;
    }
    runWithAck('create-room', { name, code: joinCode.trim() });
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

  const updateGameSetting = (key, value) => {
    emitSocket('update-settings', { ...settings, [key]: value });
  };

  const handleStartGame = () => emitSocket('start-game');
  const handleUndoStroke = () => {
    setLocalCanUndo(false);
    emitSocket('undo-stroke');
  };
  const handleFinishTurn = () => emitSocket('finish-turn');
  const resetZoom = () => setViewport({ scale: 1, offsetX: 0, offsetY: 0 });

  const getCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = viewportRef.current;
    return {
      x: clamp(((event.clientX - rect.left - offsetX) / scale) / rect.width, 0, 1),
      y: clamp(((event.clientY - rect.top - offsetY) / scale) / rect.height, 0, 1),
    };
  };

  const emitDraw = (op) => {
    drawingHistoryRef.current.push(op);
    drawOperation(op);
    setLocalCanUndo(true);
    emitSocket('draw', op);
  };

  const localDrawPayload = (from, to) => ({
    from,
    to,
    color: room?.me?.color || '#111827',
    playerColor: room?.me?.color || '#111827',
    playerId: room?.me?.id || '',
    playerName: room?.me?.name || '',
    strokeId: currentStrokeIdRef.current,
    turnId: room?.turn?.currentTurnId || '',
    size: Number(size),
    mode: tool,
  });

  const handlePointerDown = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    activePointersRef.current.set(event.pointerId, pointer);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (activePointersRef.current.size >= 2) {
      isDrawingRef.current = false;
      lastPointRef.current = null;
      const pointers = [...activePointersRef.current.values()];
      pinchRef.current = {
        distance: distanceBetween(pointers[0], pointers[1]),
        midpoint: midpointBetween(pointers[0], pointers[1]),
        viewport: viewportRef.current,
      };
      return;
    }

    if (!canDraw) return;
    currentStrokeIdRef.current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    isDrawingRef.current = true;
    hasMovedRef.current = false;
    lastPointRef.current = getCanvasPoint(event);
  };

  const handlePointerMove = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }

    if (activePointersRef.current.size >= 2 && pinchRef.current) {
      event.preventDefault();
      const pointers = [...activePointersRef.current.values()];
      const nextDistance = distanceBetween(pointers[0], pointers[1]);
      const nextMidpoint = midpointBetween(pointers[0], pointers[1]);
      const start = pinchRef.current;
      const nextScale = start.viewport.scale * (nextDistance / Math.max(start.distance, 1));
      const worldX = (start.midpoint.x - start.viewport.offsetX) / start.viewport.scale;
      const worldY = (start.midpoint.y - start.viewport.offsetY) / start.viewport.scale;

      setViewport(normalizeViewport({
        scale: nextScale,
        offsetX: nextMidpoint.x - worldX * nextScale,
        offsetY: nextMidpoint.y - worldY * nextScale,
      }));
      return;
    }

    if (!isDrawingRef.current || !canDraw) return;
    event.preventDefault();
    const nextPoint = getCanvasPoint(event);
    const lastPoint = lastPointRef.current || nextPoint;
    const dx = nextPoint.x - lastPoint.x;
    const dy = nextPoint.y - lastPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) < 0.002) return;

    hasMovedRef.current = true;
    emitDraw(localDrawPayload(lastPoint, nextPoint));
    lastPointRef.current = nextPoint;
  };

  const stopDrawing = (event) => {
    event.preventDefault();
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;

    if (!isDrawingRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* Pointer capture may already be released by the browser. */
      }
      return;
    }

    const point = getCanvasPoint(event);
    if (!hasMovedRef.current) {
      emitDraw(localDrawPayload(point, point));
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
    currentStrokeIdRef.current = '';
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

  const submitGuess = (event) => {
    event.preventDefault();
    if (!guess.trim()) return;
    emitSocket('submit-guess', { guess });
    setGuess('');
  };

  const voteTargetName = (targetId) => room?.players?.find((player) => player.id === targetId)?.name || '';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#101820] text-slate-100">
      <VisualScene phase={phase} intensity={resultIntensity} />
      <div className="relative z-10 min-h-screen">
        {toast && (
          <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg border border-teal-300/40 bg-slate-950 px-4 py-2 text-sm font-semibold text-teal-100 shadow-2xl">
            {toast}
          </div>
        )}

        {!room ? (
          <Landing
            playerName={playerName}
            setPlayerName={setPlayerName}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            connection={connection}
            error={error}
            handleCreateRoom={handleCreateRoom}
            handleJoinRoom={handleJoinRoom}
          />
        ) : (
          <>
            <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#101820]/92 backdrop-blur">
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
                  <button
                    onClick={() => setMuted((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-bold text-slate-200"
                    title={muted ? 'Sesi aç' : 'Sesi kapat'}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-bold text-slate-200"
                  >
                    <History className="h-4 w-4" />
                    Geçmiş
                  </button>
                  <div className={`rounded-full border px-3 py-1 text-sm font-black ${phaseInfo.tone}`}>{phaseInfo.label}</div>
                  {(phase === 'drawing' || phase === 'voting') && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-950 px-3 py-1 text-sm font-black text-amber-100">
                      <Clock className="h-4 w-4" />
                      {formatTime(timer.timeLeft)}
                    </div>
                  )}
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-bold text-slate-200">
                    <Users className="h-4 w-4" />
                    {room.players.filter((player) => player.connected).length}
                  </div>
                </div>
              </div>
            </header>

            {error && (
              <div className="mx-auto mt-4 max-w-7xl px-4">
                <div className="rounded-lg border border-rose-500/50 bg-rose-950/70 px-4 py-3 text-sm font-semibold text-rose-100">{error}</div>
              </div>
            )}

            {phase === 'lobby' ? (
              <Lobby
                room={room}
                isHost={isHost}
                settings={settings}
                updateGameSetting={updateGameSetting}
                handleStartGame={handleStartGame}
                emitSocket={emitSocket}
              />
            ) : (
              <Game
                room={room}
                isHost={isHost}
                timer={timer}
                canDraw={canDraw}
                tool={tool}
                setTool={setTool}
                size={size}
                setSize={setSize}
                canvasRef={canvasRef}
                handlePointerDown={handlePointerDown}
                handlePointerMove={handlePointerMove}
                stopDrawing={stopDrawing}
                viewport={viewport}
                applyViewportZoom={applyViewportZoom}
                resetZoom={resetZoom}
                emitSocket={emitSocket}
                localCanUndo={localCanUndo}
                handleUndoStroke={handleUndoStroke}
                handleFinishTurn={handleFinishTurn}
                showRoundIntro={showRoundIntro}
                closeRoundIntro={() => setShowRoundIntro(false)}
                guess={guess}
                setGuess={setGuess}
                submitGuess={submitGuess}
                voteTargetName={voteTargetName}
              />
            )}

            {showHistory && <HistoryModal room={room} onClose={() => setShowHistory(false)} />}
          </>
        )}
      </div>
    </div>
  );
}

function Landing({ playerName, setPlayerName, joinCode, setJoinCode, connection, error, handleCreateRoom, handleJoinRoom }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-950/70 px-3 py-1 text-sm font-semibold text-teal-100">
            <Sparkles className="h-4 w-4" />
            Ortak canvas blöf oyunu
          </div>
          <div>
            <h1 className="text-5xl font-black tracking-normal text-white sm:text-7xl">Kim Farklı?</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
              Kelimeyi bilmeden çiz, çizgilerden şüpheyi yakala, son anda doğru kişiyi seç.
            </p>
          </div>
          <div className="grid max-w-xl grid-cols-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/75 text-center">
            <Metric label="Oda" value="1" />
            <Metric label="Çizim" value="2" className="border-x border-slate-700" />
            <Metric label="Oy" value="3" />
          </div>
        </div>

        <Panel className="p-5 sm:p-6">
          <form className="space-y-5" onSubmit={handleJoinRoom}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Oyuncu adı</span>
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                maxLength={24}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-teal-400"
                placeholder="Örn: Deniz"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Oda kodu</span>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toLowerCase())}
                maxLength={16}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-white outline-none transition focus:border-amber-400"
                placeholder="k7p9"
              />
            </label>

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
  );
}

function Metric({ label, value, className = '' }) {
  return (
    <div className={`px-4 py-4 ${className}`}>
      <div className="text-2xl font-black text-teal-300">{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">{label}</div>
    </div>
  );
}

function Lobby({ room, isHost, settings, updateGameSetting, handleStartGame, emitSocket }) {
  return (
    <main className="mx-auto grid max-w-7xl gap-4 px-4 pb-28 pt-4 lg:grid-cols-[300px_1fr]">
      <PlayerPanel room={room} />
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-2xl font-black text-white">Oda Hazırlığı</h2>
            <p className="mt-1 text-sm text-slate-400">Tur {room.roundNumber}. Kelimeler otomatik ve gizli seçilir.</p>
          </div>
          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={!room.canStart}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-400 px-4 py-3 font-black text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-5 w-5" />
              Oyunu Başlat
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-teal-500/30 bg-teal-950/35 p-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-400 px-3 py-1 text-sm font-black text-slate-950">
              <Zap className="h-4 w-4" />
              Gizli kelime motoru
            </div>
            <h3 className="mt-4 text-3xl font-black text-white">Host dahil kimse kelimeyi önceden bilmez.</h3>
            <p className="mt-3 max-w-2xl text-slate-300">
              Skor, tur geçmişi, sıralı çizim ve farklı oyuncunun ana kelimeyi tahmin etme hakkı aktif.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <InfoTile label="Kategori" value={room.options.categories.find((item) => item.value === settings.category)?.label || 'Karışık'} />
              <InfoTile label="Zorluk" value={room.options.difficulties.find((item) => item.value === settings.difficulty)?.label || 'Karışık'} />
            </div>
          </div>

          {isHost && (
            <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
              <SegmentedSetting label="Kategori" value={settings.category} options={room.options.categories} onChange={(value) => updateGameSetting('category', value)} />
              <SegmentedSetting label="Zorluk" value={settings.difficulty} options={room.options.difficulties} onChange={(value) => updateGameSetting('difficulty', value)} />
              <NumberSetting label="Çizim süresi" value={settings.drawingSeconds} onChange={(value) => updateGameSetting('drawingSeconds', value)} />
              <NumberSetting label="Oylama süresi" value={settings.votingSeconds} onChange={(value) => updateGameSetting('votingSeconds', value)} />
              <NumberSetting label="Oyuncu sıra süresi" value={settings.turnSeconds} onChange={(value) => updateGameSetting('turnSeconds', value)} min="10" max="120" />
              <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
                <span className="text-sm font-bold text-slate-200">Farklı kişi tahmin hakkı</span>
                <input
                  type="checkbox"
                  checked={settings.oddGuessEnabled}
                  onChange={(event) => updateGameSetting('oddGuessEnabled', event.target.checked)}
                  className="h-5 w-5 accent-teal-400"
                />
              </label>
            </div>
          )}
        </div>
      </Panel>
      {!isHost && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-950/94 px-4 py-4 shadow-2xl backdrop-blur">
          <button
            onClick={() => emitSocket('toggle-ready')}
            className={`mx-auto flex w-full max-w-lg animate-pulse items-center justify-center gap-2 rounded-lg border-2 px-5 py-4 text-lg font-black shadow-2xl transition ${
              room.me?.ready
                ? 'border-teal-200 bg-teal-400 text-slate-950 shadow-teal-400/30'
                : 'border-amber-200 bg-amber-400 text-slate-950 shadow-amber-400/30'
            }`}
          >
            <Check className="h-6 w-6" />
            {room.me?.ready ? 'Hazırsın' : 'Hazır Ol'}
          </button>
        </div>
      )}
    </main>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3">
      <div className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 font-black text-slate-100">{value}</div>
    </div>
  );
}

function SegmentedSetting({ label, value, options, onChange }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-300">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-black transition ${
              value === option.value
                ? 'border-teal-300 bg-teal-400 text-slate-950'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-teal-500 hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberSetting({ label, value, onChange, min = '15', max = '600' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-300">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step="5"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-teal-400"
      />
      <div className="mt-1 text-xs font-semibold text-slate-500">{formatTime(Number(value) || 0)}</div>
    </label>
  );
}

function Game(props) {
  const {
    room,
    isHost,
    timer,
    canDraw,
    tool,
    setTool,
    size,
    setSize,
    canvasRef,
    handlePointerDown,
    handlePointerMove,
    stopDrawing,
    viewport,
    applyViewportZoom,
    resetZoom,
    emitSocket,
    localCanUndo,
    handleUndoStroke,
    handleFinishTurn,
    showRoundIntro,
    closeRoundIntro,
    guess,
    setGuess,
    submitGuess,
    voteTargetName,
  } = props;
  const phase = room.phase;
  const turnName = room.turn?.currentPlayerName;
  const turnColor = room.turn?.currentPlayerColor || '#64748b';

  return (
    <main className="relative min-h-[calc(100vh-68px)] px-3 pb-56 pt-24 sm:px-4">
      {showRoundIntro && phase === 'drawing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/88 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-lg border border-teal-300/40 bg-slate-900 p-6 text-center shadow-2xl shadow-teal-950/50">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-teal-400 text-slate-950">
              <Pencil className="h-7 w-7" />
            </div>
            <div className="text-sm font-black uppercase tracking-widest text-teal-200">Tur başladı</div>
            <div className="mt-3 text-4xl font-black text-amber-200">{room.me?.word || 'Kelime geliyor'}</div>
            <div className="mt-4 text-base font-semibold leading-7 text-slate-300">
              Sıra sana geldiğinde çiz. Her oyuncunun iki çizim hakkı var; `Geç` ile hakkını erken bitirebilirsin.
            </div>
            <button
              onClick={closeRoundIntro}
              className="mt-6 rounded-lg bg-teal-400 px-5 py-3 font-black text-slate-950 transition hover:bg-teal-300"
            >
              Çizime geç
            </button>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 top-[66px] z-30 border-b border-slate-800 bg-slate-950/94 px-3 py-3 shadow-2xl backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500">Kelime</div>
            <div className="truncate text-xl font-black text-amber-200 sm:text-2xl">{room.me?.word || 'Bekleniyor'}</div>
          </div>
          {(phase === 'drawing' || phase === 'voting') && (
            <div className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-950 px-3 py-2 text-right">
              <div className="text-xs font-black uppercase tracking-widest text-amber-300/70">Süre</div>
              <div className="font-mono text-2xl font-black text-amber-100">{formatTime(timer.timeLeft)}</div>
            </div>
          )}
          {phase === 'drawing' && (
            <div className="hidden shrink-0 rounded-lg border border-teal-400/40 bg-teal-950 px-3 py-2 text-right sm:block">
              <div className="text-xs font-black uppercase tracking-widest text-teal-300/70">Hak</div>
              <div className="font-black text-teal-100">{room.turn?.currentTurnNumber || 1}/{room.turn?.turnsPerPlayer || 2}</div>
            </div>
          )}
        </div>
      </div>

      <Panel className="mx-auto max-w-7xl overflow-hidden">
        <div className="relative bg-stone-50">
          <canvas
            ref={canvasRef}
            className={`block h-[calc(100vh-270px)] min-h-[460px] w-full touch-none ${canDraw ? 'cursor-crosshair' : 'cursor-default'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          {!canDraw && phase === 'drawing' && (
            <div className="pointer-events-none absolute inset-x-4 top-4 rounded-lg border border-slate-300 bg-white/92 px-3 py-2 text-center text-sm font-bold text-slate-700 shadow">
              <span className="inline-flex items-center justify-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: turnColor }} />
                Sıra {turnName || 'oyuncu'} oyuncusunda.
              </span>
            </div>
          )}
          {phase === 'voting' && (
            <div className="pointer-events-none absolute inset-x-4 top-4 rounded-lg border border-slate-300 bg-white/92 px-3 py-2 text-center text-sm font-bold text-slate-700 shadow">
              Çizim kilitlendi. Oylar bekleniyor.
            </div>
          )}
          {phase === 'drawing' && (
            <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-lg border border-slate-300 bg-white/92 px-3 py-2 text-sm font-black text-slate-800 shadow">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: turnColor }} />
              <span className="text-slate-500">Sıra:</span> {turnName || '-'}
              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-700">{room.turn?.currentTurnNumber || 1}/{room.turn?.turnsPerPlayer || 2}</span>
              <span className="font-mono text-amber-600">{formatTime(timer.turn?.timeLeft || 0)}</span>
            </div>
          )}
          <div className="absolute right-4 top-4 flex overflow-hidden rounded-lg border border-slate-300 bg-white/92 text-slate-800 shadow">
            <button
              onClick={() => applyViewportZoom(viewport.scale * 1.2)}
              className="h-9 w-10 border-r border-slate-300 text-lg font-black transition hover:bg-slate-100"
              title="Yakınlaştır"
            >
              +
            </button>
            <button
              onClick={() => applyViewportZoom(viewport.scale / 1.2)}
              className="h-9 w-10 border-r border-slate-300 text-lg font-black transition hover:bg-slate-100"
              title="Uzaklaştır"
            >
              -
            </button>
            <button
              onClick={resetZoom}
              className="inline-flex h-9 w-10 items-center justify-center transition hover:bg-slate-100"
              title="Zoom sıfırla"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Panel>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-3 py-3 shadow-2xl backdrop-blur sm:px-4">
        <div className="mx-auto max-h-[42vh] max-w-7xl overflow-y-auto">
          {phase === 'drawing' && (
            <DrawingTools
            tool={tool}
            setTool={setTool}
            size={size}
            setSize={setSize}
            emitSocket={emitSocket}
              localCanUndo={localCanUndo}
              handleUndoStroke={handleUndoStroke}
              handleFinishTurn={handleFinishTurn}
              room={room}
            />
          )}
          {phase === 'voting' && <VotingPanel room={room} isHost={isHost} emitSocket={emitSocket} voteTargetName={voteTargetName} />}
          {phase === 'result' && <ResultPanel room={room} isHost={isHost} onNewRound={() => emitSocket('new-round')} />}
          {(phase === 'drawing' || phase === 'voting') && room.settings.oddGuessEnabled && (
            <form onSubmit={submitGuess} className="mt-3 rounded-lg border border-violet-500/40 bg-violet-950/35 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-violet-200">
                <Target className="h-4 w-4" />
                Ana kelime tahmini
              </div>
              <div className="flex gap-2">
                <input
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  disabled={room.me?.hasGuessed}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-300 disabled:opacity-60"
                  placeholder={room.me?.hasGuessed ? 'Tahmin gönderildi' : 'Tahmin yaz'}
                />
                <button
                  disabled={room.me?.hasGuessed || !guess.trim()}
                  className="rounded-lg bg-violet-400 px-3 py-2 font-black text-slate-950 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function DrawingTools({ tool, setTool, size, setSize, emitSocket, localCanUndo, handleUndoStroke, handleFinishTurn, room }) {
  const myColor = room.me?.color || '#111827';
  const turnColor = room.turn?.currentPlayerColor || '#64748b';
  const isMyTurn = !!room.me?.canDraw;

  return (
    <div className="grid gap-3 lg:grid-cols-[220px_1fr_280px_220px] lg:items-center">
      <div>
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Araçlar</div>
        <div className="grid grid-cols-2 gap-2">
          <ToolButton active={tool === 'pen'} onClick={() => setTool('pen')} icon={<Pencil className="h-5 w-5" />} label="Kalem" />
          <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser className="h-5 w-5" />} label="Silgi" />
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Oyuncu rengin</div>
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-full border-2 border-white/70 shadow-lg shadow-black/30" style={{ backgroundColor: myColor }} />
          <div className="min-w-0">
            <div className="truncate font-black text-white">{room.me?.name || 'Sen'}</div>
            <div className="text-xs font-semibold text-slate-500">Çizgilerin bu renkle görünür.</div>
          </div>
        </div>
      </div>

      <label className="block rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
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

      <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-300">
        <div className="mb-1 text-xs font-black uppercase tracking-widest text-slate-500">Şu an çizen</div>
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: turnColor }} />
          <span className="font-black text-white">{room.turn.currentPlayerName || '-'}</span>
          <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs font-black text-teal-200">
            {room.turn?.currentTurnNumber || 1}/{room.turn?.turnsPerPlayer || 2}
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:col-span-4">
        {isMyTurn && (
          <>
            <button
              onClick={handleUndoStroke}
              disabled={!room.me?.canUndo && !localCanUndo}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 font-bold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RotateCcw className="h-5 w-5" />
              Geri al
            </button>
            <button
              onClick={handleFinishTurn}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-3 py-3 font-black text-slate-950 transition hover:bg-amber-300"
            >
              <Send className="h-5 w-5" />
              Geç
            </button>
          </>
        )}
        {isMyTurn && (
          <button
            onClick={() => emitSocket('clear-canvas')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-700 bg-rose-950 px-4 py-3 font-bold text-rose-100 transition hover:bg-rose-900 sm:col-span-2 lg:col-span-1"
          >
            <Trash2 className="h-5 w-5" />
            Bu hakkı temizle
          </button>
        )}
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 font-bold ${active ? 'bg-teal-400 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function VotingPanel({ room, isHost, emitSocket, voteTargetName }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-black uppercase tracking-widest text-slate-500">Sence kim farklı?</div>
        {room.me?.votedFor && <p className="mt-2 text-sm font-semibold text-amber-200">Oyun alındı: {voteTargetName(room.me.votedFor)}</p>}
      </div>
      <div className="grid gap-2">
        {room.players.filter((player) => player.id !== room.me?.id && player.connected).map((player) => (
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
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/50" style={{ backgroundColor: player.color || '#64748b' }} />
              <span className="min-w-0 truncate font-bold">{player.name}</span>
            </span>
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
  );
}

function PlayerPanel({ room }) {
  const sortedScores = [...room.players].sort((a, b) => b.score - a.score);
  const leader = sortedScores[0];
  const displayPlayers = [...room.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return a.name.localeCompare(b.name, 'tr');
  });

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black text-white">Oyuncular</h2>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-bold text-slate-300">{room.players.filter((player) => player.connected).length}</span>
      </div>
      {leader && (
        <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-950/35 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 font-black text-amber-100">
              <Crown className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="truncate">{leader.name}</span>
            </span>
            <span className="font-mono font-black text-amber-200">{leader.score}</span>
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-amber-200/60">En yüksek puan</div>
        </div>
      )}
      <div className="space-y-2">
        {displayPlayers.map((player, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
              room.result?.differentPlayerId === player.id
                ? 'border-rose-400 bg-rose-950/60'
                : player.id === room.me?.id
                  ? 'border-teal-400/70 bg-teal-950/35'
                  : 'border-slate-700 bg-slate-800/70'
            } ${!player.connected ? 'opacity-50' : ''}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 font-black text-slate-200">
                  {playerInitial(player.name)}
                </div>
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-900" style={{ backgroundColor: player.color || '#64748b' }} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-100">
                  {player.name}
                  {player.id === room.me?.id ? ' (Sen)' : ''}
                </div>
                <div className="text-xs font-semibold text-slate-500">Oyuncu {index + 1} · {player.score} puan</div>
              </div>
            </div>
            <div className="ml-3 flex items-center gap-2">
              {player.isHost && <Crown className="h-4 w-4 text-amber-300" />}
              {room.phase === 'lobby' && player.ready && <Check className="h-4 w-4 text-teal-300" />}
              {room.phase === 'voting' && player.hasVoted && <Vote className="h-4 w-4 text-amber-300" />}
              {room.phase !== 'lobby' && player.hasGuessed && <Eye className="h-4 w-4 text-violet-300" />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-slate-800 pt-4">
        <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Skor</div>
        <div className="space-y-1">
          {sortedScores.slice(0, 5).map((player, index) => (
            <div key={player.id} className="flex items-center justify-between text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-300">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: player.color || '#64748b' }} />
                <span className="truncate">{index + 1}. {player.name}</span>
              </span>
              <span className="font-mono font-black text-amber-200">{player.score}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ResultPanel({ room, isHost, onNewRound }) {
  const counts = room.result?.voteCounts || {};
  const winnerText = {
    majority: 'Çoğunluk farklı oyuncuyu buldu.',
    different: 'Farklı kelimeye sahip oyuncu yakalanmadı.',
    different_guess: 'Farklı oyuncu ana kelimeyi tahmin etti.',
  }[room.result?.winner] || 'Sonuçlar açıldı.';

  return (
    <div className="relative space-y-5 overflow-hidden">
      <Celebration />
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/50 bg-rose-950 px-3 py-1 text-sm font-black text-rose-100">
          <Trophy className="h-4 w-4" />
          {room.result?.winner === 'majority' ? 'Çoğunluk Kazandı' : 'Farklı Oyuncu Kazandı'}
        </div>
        <h2 className="mt-4 text-2xl font-black text-white">{winnerText}</h2>
      </div>

      <div className="grid gap-3">
        <InfoTile label="Farklı oyuncu" value={room.result?.differentPlayerName} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <InfoTile label="Ana kelime" value={room.result?.mainWord} />
          <InfoTile label="Farklı kelime" value={room.result?.differentWord} />
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Oy dağılımı</div>
        <div className="space-y-2">
          {room.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 font-bold text-slate-200">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: player.color || '#64748b' }} />
                <span className="truncate">{player.name}</span>
              </span>
              <span className="font-mono text-lg font-black text-amber-200">{counts[player.id] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-black uppercase tracking-widest text-slate-500">Skor</div>
        <div className="space-y-2">
          {(room.result?.scores || []).map((player, index) => (
            <div key={player.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 font-bold text-slate-200">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: player.color || '#64748b' }} />
                <span className="truncate">{index + 1}. {player.name}</span>
              </span>
              <span className="font-mono text-lg font-black text-teal-200">{player.score}</span>
            </div>
          ))}
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

function Celebration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          className="absolute h-2 w-2 animate-[spark_1.8s_ease-out_infinite] rounded-sm bg-amber-300 opacity-80"
          style={{
            left: `${(index * 23) % 100}%`,
            top: `${(index * 37) % 80}%`,
            animationDelay: `${index * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

function HistoryModal({ room, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur" onClick={onClose}>
      <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-xl font-black text-white">Tur Geçmişi</h2>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-slate-200">Kapat</button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          {room.history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-slate-400">Henüz tamamlanan tur yok.</div>
          ) : (
            <div className="space-y-3">
              {[...room.history].reverse().map((round) => (
                <div key={round.roundNumber} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-black text-white">Tur {round.roundNumber}</div>
                    <div className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-300">
                      {round.winner === 'majority' ? 'Çoğunluk' : 'Farklı oyuncu'}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <InfoTile label="Farklı" value={round.differentPlayerName} />
                    <InfoTile label="Ana" value={round.mainWord} />
                    <InfoTile label="Diğer" value={round.differentWord} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
