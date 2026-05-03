const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const rooms = {};
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const MAX_DRAWING_OPS = 25000;
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
const TURNS_PER_PLAYER = 2;
const PLAYER_COLORS = ['#0f766e', '#e11d48', '#2563eb', '#f59e0b', '#7c3aed', '#16a34a', '#db2777', '#0891b2'];

const DEFAULT_SETTINGS = {
  drawingSeconds: 120,
  votingSeconds: 45,
  turnSeconds: 25,
  category: 'all',
  difficulty: 'all',
  oddGuessEnabled: true,
};

const CATEGORIES = [
  { value: 'all', label: 'Karışık' },
  { value: 'animal', label: 'Hayvanlar' },
  { value: 'food', label: 'Yemek' },
  { value: 'place', label: 'Yerler' },
  { value: 'object', label: 'Eşyalar' },
  { value: 'job', label: 'Meslekler' },
  { value: 'vehicle', label: 'Araçlar' },
  { value: 'nature', label: 'Doğa' },
  { value: 'fantasy', label: 'Fantastik' },
  { value: 'sport', label: 'Spor' },
];

const DIFFICULTIES = [
  { value: 'all', label: 'Karışık' },
  { value: 'easy', label: 'Kolay' },
  { value: 'medium', label: 'Orta' },
  { value: 'hard', label: 'Zor' },
];

const WORD_PAIRS = [
  { mainWord: 'Kedi', differentWord: 'Köpek', category: 'animal', difficulty: 'easy' },
  { mainWord: 'Kaplumbağa', differentWord: 'Tavşan', category: 'animal', difficulty: 'easy' },
  { mainWord: 'Zebra', differentWord: 'At', category: 'animal', difficulty: 'easy' },
  { mainWord: 'Balık', differentWord: 'Yunus', category: 'animal', difficulty: 'medium' },
  { mainWord: 'Kelebek', differentWord: 'Arı', category: 'animal', difficulty: 'medium' },
  { mainWord: 'Baykuş', differentWord: 'Kartal', category: 'animal', difficulty: 'hard' },
  { mainWord: 'Pizza', differentWord: 'Lahmacun', category: 'food', difficulty: 'easy' },
  { mainWord: 'Kahve', differentWord: 'Çay', category: 'food', difficulty: 'easy' },
  { mainWord: 'Elma', differentWord: 'Armut', category: 'food', difficulty: 'easy' },
  { mainWord: 'Limon', differentWord: 'Portakal', category: 'food', difficulty: 'easy' },
  { mainWord: 'Pasta', differentWord: 'Kurabiye', category: 'food', difficulty: 'medium' },
  { mainWord: 'Tencere', differentWord: 'Tava', category: 'food', difficulty: 'medium' },
  { mainWord: 'Fırın', differentWord: 'Ocak', category: 'food', difficulty: 'medium' },
  { mainWord: 'Suşi', differentWord: 'Mantı', category: 'food', difficulty: 'hard' },
  { mainWord: 'Kütüphane', differentWord: 'Kitapçı', category: 'place', difficulty: 'medium' },
  { mainWord: 'Sinema', differentWord: 'Tiyatro', category: 'place', difficulty: 'easy' },
  { mainWord: 'Müze', differentWord: 'Galeri', category: 'place', difficulty: 'medium' },
  { mainWord: 'Kale', differentWord: 'Saray', category: 'place', difficulty: 'easy' },
  { mainWord: 'Mağara', differentWord: 'Dağ Evi', category: 'place', difficulty: 'hard' },
  { mainWord: 'Ada', differentWord: 'Sahil', category: 'place', difficulty: 'medium' },
  { mainWord: 'Okul', differentWord: 'Üniversite', category: 'place', difficulty: 'easy' },
  { mainWord: 'Kalem', differentWord: 'Fırça', category: 'object', difficulty: 'easy' },
  { mainWord: 'Çanta', differentWord: 'Valiz', category: 'object', difficulty: 'easy' },
  { mainWord: 'Saat', differentWord: 'Takvim', category: 'object', difficulty: 'medium' },
  { mainWord: 'Ayna', differentWord: 'Pencere', category: 'object', difficulty: 'medium' },
  { mainWord: 'Çorap', differentWord: 'Ayakkabı', category: 'object', difficulty: 'easy' },
  { mainWord: 'Makas', differentWord: 'Bıçak', category: 'object', difficulty: 'medium' },
  { mainWord: 'Şemsiye', differentWord: 'Yağmurluk', category: 'object', difficulty: 'medium' },
  { mainWord: 'Kum Saati', differentWord: 'Saat', category: 'object', difficulty: 'hard' },
  { mainWord: 'Doktor', differentWord: 'Hemşire', category: 'job', difficulty: 'easy' },
  { mainWord: 'Astronot', differentWord: 'Pilot', category: 'job', difficulty: 'medium' },
  { mainWord: 'Korsan', differentWord: 'Denizci', category: 'job', difficulty: 'medium' },
  { mainWord: 'Palyaço', differentWord: 'Sihirbaz', category: 'job', difficulty: 'medium' },
  { mainWord: 'İtfaiyeci', differentWord: 'Paramedik', category: 'job', difficulty: 'hard' },
  { mainWord: 'Tren', differentWord: 'Metro', category: 'vehicle', difficulty: 'easy' },
  { mainWord: 'Uçak', differentWord: 'Helikopter', category: 'vehicle', difficulty: 'easy' },
  { mainWord: 'Bisiklet', differentWord: 'Motosiklet', category: 'vehicle', difficulty: 'easy' },
  { mainWord: 'Taksi', differentWord: 'Otobüs', category: 'vehicle', difficulty: 'easy' },
  { mainWord: 'Karavan', differentWord: 'Otel', category: 'vehicle', difficulty: 'hard' },
  { mainWord: 'Roket', differentWord: 'Uydu', category: 'vehicle', difficulty: 'medium' },
  { mainWord: 'Deniz', differentWord: 'Göl', category: 'nature', difficulty: 'easy' },
  { mainWord: 'Ay', differentWord: 'Güneş', category: 'nature', difficulty: 'easy' },
  { mainWord: 'Dağ', differentWord: 'Tepe', category: 'nature', difficulty: 'easy' },
  { mainWord: 'Orman', differentWord: 'Bahçe', category: 'nature', difficulty: 'easy' },
  { mainWord: 'Şelale', differentWord: 'Nehir', category: 'nature', difficulty: 'medium' },
  { mainWord: 'Kaktüs', differentWord: 'Çiçek', category: 'nature', difficulty: 'medium' },
  { mainWord: 'Kardan Adam', differentWord: 'Buz Pateni', category: 'nature', difficulty: 'hard' },
  { mainWord: 'Robot', differentWord: 'Bilgisayar', category: 'fantasy', difficulty: 'easy' },
  { mainWord: 'Ejderha', differentWord: 'Dinozor', category: 'fantasy', difficulty: 'easy' },
  { mainWord: 'Cadı', differentWord: 'Büyücü', category: 'fantasy', difficulty: 'medium' },
  { mainWord: 'Hazine', differentWord: 'Define Haritası', category: 'fantasy', difficulty: 'hard' },
  { mainWord: 'Futbol', differentWord: 'Basketbol', category: 'sport', difficulty: 'easy' },
  { mainWord: 'Tenis', differentWord: 'Badminton', category: 'sport', difficulty: 'medium' },
  { mainWord: 'Kayak', differentWord: 'Snowboard', category: 'sport', difficulty: 'medium' },
  { mainWord: 'Satranç', differentWord: 'Dama', category: 'sport', difficulty: 'hard' },
];

app.get('/health', (_req, res) => {
  res.json({ ok: true, game: 'Kim Farkli' });
});

function createRoomCode() {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms[code]);
  return code;
}

function cleanText(value, maxLength = 32) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeCode(value) {
  return cleanText(value, 16).toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function normalizeGuess(value) {
  return cleanText(value, 32).toLocaleLowerCase('tr-TR');
}

function clampSeconds(value, fallback, min = 15, max = 600) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(Math.max(seconds, min), max);
}

function normalizeSettings(current, payload = {}) {
  const categoryValues = new Set(CATEGORIES.map((item) => item.value));
  const difficultyValues = new Set(DIFFICULTIES.map((item) => item.value));

  return {
    drawingSeconds: clampSeconds(payload.drawingSeconds, current.drawingSeconds),
    votingSeconds: clampSeconds(payload.votingSeconds, current.votingSeconds),
    turnSeconds: clampSeconds(payload.turnSeconds, current.turnSeconds, 10, 120),
    category: categoryValues.has(payload.category) ? payload.category : current.category,
    difficulty: difficultyValues.has(payload.difficulty) ? payload.difficulty : current.difficulty,
    oddGuessEnabled: payload.oddGuessEnabled !== false,
  };
}

function activePlayers(room) {
  return Object.values(room.players)
    .filter((player) => player.connected)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

function connectedPlayerIds(room) {
  return activePlayers(room).map((player) => player.id);
}

function allNonHostsReady(room) {
  const players = activePlayers(room);
  return players.length >= 2 && players.every((player) => player.id === room.hostId || player.ready);
}

function roomPlayers(room) {
  return Object.values(room.players)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      isHost: player.id === room.hostId,
      ready: !!player.ready,
      connected: !!player.connected,
      score: Number(player.score) || 0,
      turnsCompleted: room.turnCounts?.[player.id] || 0,
      hasVoted: !!room.votes[player.id],
      hasGuessed: !!room.guesses[player.id],
    }));
}

function playerCanUndo(room, playerId) {
  return room.phase === 'drawing'
    && room.currentTurnPlayerId === playerId
    && room.drawingHistory.some((op) => op.playerId === playerId);
}

function voteCounts(room) {
  return Object.values(room.votes).reduce((counts, votedPlayerId) => {
    counts[votedPlayerId] = (counts[votedPlayerId] || 0) + 1;
    return counts;
  }, {});
}

function translatedVotes(room) {
  return Object.entries(room.votes).map(([voterId, targetId]) => ({
    voterId,
    voterName: room.players[voterId]?.name || 'Ayrılan oyuncu',
    targetId,
    targetName: room.players[targetId]?.name || 'Ayrılan oyuncu',
  }));
}

function getTimerState(room) {
  const phaseTimer = room.phaseEndsAt
    ? {
        timeLeft: Math.max(0, Math.ceil((room.phaseEndsAt - Date.now()) / 1000)),
        total: room.phaseDuration || 0,
      }
    : { timeLeft: 0, total: 0 };

  const turnTimer = room.turnEndsAt
    ? {
        timeLeft: Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000)),
        total: room.turnDuration || 0,
      }
    : { timeLeft: 0, total: 0 };

  return { ...phaseTimer, turn: turnTimer };
}

function buildRoomState(room, viewerId) {
  const viewer = room.players[viewerId];
  const isHost = viewerId === room.hostId;
  const resultVisible = room.phase === 'result';

  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    roundNumber: room.roundNumber,
    players: roomPlayers(room),
    settings: room.settings,
    options: {
      categories: CATEGORIES,
      difficulties: DIFFICULTIES,
    },
    timer: getTimerState(room),
    turn: {
      currentPlayerId: room.currentTurnPlayerId || '',
      currentPlayerName: room.players[room.currentTurnPlayerId]?.name || '',
      currentPlayerColor: room.players[room.currentTurnPlayerId]?.color || '',
      currentTurnId: room.currentTurnId || '',
      currentTurnNumber: Math.min((room.turnCounts?.[room.currentTurnPlayerId] || 0) + 1, TURNS_PER_PLAYER),
      turnsPerPlayer: TURNS_PER_PLAYER,
      completedTurns: room.turnCounts || {},
    },
    canStart: allNonHostsReady(room),
    history: room.roundHistory.slice(-8),
    me: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          isHost,
          word: viewer.assignedWord || '',
          votedFor: room.votes[viewer.id] || '',
          ready: !!viewer.ready,
          score: Number(viewer.score) || 0,
          color: viewer.color,
          hasGuessed: !!room.guesses[viewer.id],
          connected: !!viewer.connected,
          canDraw: canPlayerDraw(room, viewer.id),
          canUndo: playerCanUndo(room, viewer.id),
        }
      : null,
    result: resultVisible
      ? {
          differentPlayerId: room.differentPlayerId,
          differentPlayerName: room.players[room.differentPlayerId]?.name || 'Ayrılan oyuncu',
          mainWord: room.mainWord,
          differentWord: room.differentWord,
          winner: room.winner,
          reason: room.resultReason,
          voteCounts: voteCounts(room),
          votes: translatedVotes(room),
          scores: roomPlayers(room).sort((a, b) => b.score - a.score),
        }
      : null,
  };
}

function emitRoomState(room) {
  if (!room) return;
  Object.keys(room.players).forEach((playerId) => {
    const player = room.players[playerId];
    if (player.connected && player.socketId) {
      io.to(player.socketId).emit('room-state', buildRoomState(room, playerId));
    }
  });
}

function emitRoomMessage(room, message) {
  if (room) io.to(room.code).emit('room-message', message);
}

function emitTimer(room) {
  if (!room) return;
  io.to(room.code).emit('timer-tick', getTimerState(room));
}

function clearRoomTimer(room) {
  if (room?.timerInterval) clearInterval(room.timerInterval);
  if (room) {
    room.timerInterval = null;
    room.phaseEndsAt = null;
    room.phaseDuration = 0;
    room.turnEndsAt = null;
    room.turnDuration = 0;
  }
}

function resetRound(room) {
  clearRoomTimer(room);
  room.phase = 'lobby';
  room.differentPlayerId = '';
  room.votes = {};
  room.guesses = {};
  room.winner = null;
  room.resultReason = '';
  room.drawingHistory = [];
  room.mainWord = '';
  room.differentWord = '';
  room.currentTurnIndex = 0;
  room.currentTurnPlayerId = '';
  room.currentTurnId = '';
  room.turnCounts = {};
  Object.values(room.players).forEach((player) => {
    player.assignedWord = '';
    player.ready = false;
  });
}

function pickWordPair(room) {
  const filtered = WORD_PAIRS.filter((pair) => {
    const categoryOk = room.settings.category === 'all' || pair.category === room.settings.category;
    const difficultyOk = room.settings.difficulty === 'all' || pair.difficulty === room.settings.difficulty;
    return categoryOk && difficultyOk;
  });
  const pool = filtered.length ? filtered : WORD_PAIRS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function assignScores(room) {
  const differentPlayer = room.players[room.differentPlayerId];
  if (!differentPlayer) return;

  if (room.winner === 'majority') {
    Object.values(room.players).forEach((player) => {
      if (player.id !== room.differentPlayerId) player.score = (player.score || 0) + 1;
    });
    return;
  }

  if (room.winner === 'different_guess') {
    differentPlayer.score = (differentPlayer.score || 0) + 3;
    return;
  }

  differentPlayer.score = (differentPlayer.score || 0) + 2;
}

function pushRoundHistory(room) {
  const alreadyStored = room.roundHistory.some((round) => round.roundNumber === room.roundNumber);
  if (alreadyStored) return;

  room.roundHistory.push({
    roundNumber: room.roundNumber,
    differentPlayerName: room.players[room.differentPlayerId]?.name || 'Ayrılan oyuncu',
    mainWord: room.mainWord,
    differentWord: room.differentWord,
    winner: room.winner,
    reason: room.resultReason,
    votes: translatedVotes(room),
    scores: roomPlayers(room).sort((a, b) => b.score - a.score),
    finishedAt: Date.now(),
  });
}

function resolveVoting(room, reasonOverride = '') {
  if (!room || room.phase === 'result') return;
  clearRoomTimer(room);

  const counts = voteCounts(room);
  const entries = Object.entries(counts);
  let topVotes = 0;
  let topTargets = [];

  entries.forEach(([targetId, count]) => {
    if (count > topVotes) {
      topVotes = count;
      topTargets = [targetId];
    } else if (count === topVotes) {
      topTargets.push(targetId);
    }
  });

  const caughtDifferentPlayer = topTargets.length === 1 && topTargets[0] === room.differentPlayerId;
  room.phase = 'result';
  room.winner = caughtDifferentPlayer ? 'majority' : 'different';
  room.resultReason = reasonOverride || (caughtDifferentPlayer ? 'vote_caught' : (topTargets.length > 1 ? 'vote_tie' : 'vote_missed'));
  assignScores(room);
  pushRoundHistory(room);
}

function resolveDifferentGuess(room) {
  if (!room || room.phase === 'result') return;
  clearRoomTimer(room);
  room.phase = 'result';
  room.winner = 'different_guess';
  room.resultReason = 'different_guessed_main_word';
  assignScores(room);
  pushRoundHistory(room);
}

function canPlayerDraw(room, playerId) {
  if (!room || room.phase !== 'drawing' || !room.players[playerId]?.connected) return false;
  return room.currentTurnPlayerId === playerId;
}

function resetTurnState(room) {
  room.currentTurnIndex = 0;
  room.currentTurnPlayerId = '';
  room.currentTurnId = '';
  room.turnEndsAt = null;
  room.turnDuration = 0;
  room.turnCounts = {};
}

function pendingTurnPlayers(room) {
  return activePlayers(room).filter((player) => (room.turnCounts?.[player.id] || 0) < TURNS_PER_PLAYER);
}

function setTurnPlayer(room, index = 0) {
  const players = activePlayers(room);
  if (!players.length || !pendingTurnPlayers(room).length) {
    room.currentTurnIndex = 0;
    room.currentTurnPlayerId = '';
    room.currentTurnId = '';
    room.turnEndsAt = null;
    room.turnDuration = 0;
    return;
  }

  const normalizedStart = ((index % players.length) + players.length) % players.length;
  let nextIndex = normalizedStart;
  for (let step = 0; step < players.length; step += 1) {
    const candidateIndex = (normalizedStart + step) % players.length;
    if ((room.turnCounts?.[players[candidateIndex].id] || 0) < TURNS_PER_PLAYER) {
      nextIndex = candidateIndex;
      break;
    }
  }

  room.currentTurnIndex = nextIndex;
  room.currentTurnPlayerId = players[nextIndex].id;
  room.currentTurnId = `${room.currentTurnPlayerId}:${(room.turnCounts[room.currentTurnPlayerId] || 0) + 1}`;
  room.turnDuration = room.settings.turnSeconds;
  room.turnEndsAt = Date.now() + room.settings.turnSeconds * 1000;
}

function advanceTurn(room, countCurrent = true) {
  if (!room || room.phase !== 'drawing') return;
  if (countCurrent && room.currentTurnPlayerId) {
    room.turnCounts[room.currentTurnPlayerId] = Math.min((room.turnCounts[room.currentTurnPlayerId] || 0) + 1, TURNS_PER_PLAYER);
  }

  if (!pendingTurnPlayers(room).length) {
    moveToVoting(room, 'Herkes iki çizim hakkını kullandı. Oylama başladı.');
    return;
  }

  setTurnPlayer(room, (room.currentTurnIndex || 0) + 1);
  emitRoomState(room);
  emitRoomMessage(room, `Sıra ${room.players[room.currentTurnPlayerId]?.name || 'oyuncu'} oyuncusunda.`);
}

function moveToVoting(room, reason = 'Oylama başladı.') {
  if (!room || room.phase !== 'drawing') return;
  room.phase = 'voting';
  room.votes = {};
  room.currentTurnPlayerId = '';
  room.currentTurnId = '';
  room.turnEndsAt = null;
  room.turnDuration = 0;
  room.phaseDuration = room.settings.votingSeconds;
  room.phaseEndsAt = Date.now() + room.settings.votingSeconds * 1000;
  emitRoomState(room);
  emitRoomMessage(room, reason);
}

function startPhaseTimer(room, seconds, onEnd) {
  clearRoomTimer(room);
  room.phaseDuration = seconds;
  room.phaseEndsAt = Date.now() + seconds * 1000;
  if (room.phase === 'drawing') {
    setTurnPlayer(room, 0);
  }

  emitTimer(room);
  room.timerInterval = setInterval(() => {
    if (!rooms[room.code]) return;

    if (room.phase === 'drawing' && getTimerState(room).turn.timeLeft <= 0) {
      advanceTurn(room);
    }

    emitTimer(room);
    if (getTimerState(room).timeLeft <= 0) {
      if (room.phase === 'drawing') {
        moveToVoting(room, 'Çizim süresi bitti. Oylama başladı.');
      } else {
        clearRoomTimer(room);
        onEnd();
      }
    }
  }, 1000);
}

function getRoomByCode(code) {
  return rooms[normalizeCode(code)];
}

function getRoomBySocket(socket) {
  const code = socket.data.roomCode;
  if (!code) return null;
  return rooms[code] || null;
}

function assertHost(socket, room) {
  return room && room.hostId === socket.data.playerId;
}

function nextPlayerColor(room) {
  const usedColors = new Set(Object.values(room.players).map((player) => player.color).filter(Boolean));
  const preferredIndex = Object.keys(room.players).length % PLAYER_COLORS.length;
  const orderedColors = [...PLAYER_COLORS.slice(preferredIndex), ...PLAYER_COLORS.slice(0, preferredIndex)];
  return orderedColors.find((color) => !usedColors.has(color)) || PLAYER_COLORS[preferredIndex];
}

function normalizeDrawingOp(rawOp, player, room) {
  const mode = rawOp?.mode === 'eraser' ? 'eraser' : 'pen';
  const size = Math.min(Math.max(Number(rawOp?.size) || 4, 1), 64);
  const playerColor = /^#[0-9a-f]{6}$/i.test(player?.color || '') ? player.color : '#111827';
  const strokeId = cleanText(rawOp?.strokeId, 80) || `${player?.id || 'player'}-${Date.now()}`;

  const point = (value) => ({
    x: Math.min(Math.max(Number(value?.x) || 0, 0), 1),
    y: Math.min(Math.max(Number(value?.y) || 0, 0), 1),
  });

  return {
    from: point(rawOp?.from),
    to: point(rawOp?.to),
    color: playerColor,
    playerColor,
    playerId: player?.id || '',
    playerName: cleanText(player?.name || 'Oyuncu', 24),
    strokeId,
    turnId: room?.currentTurnId || '',
    size,
    mode,
  };
}

function ensurePlayerId(payload, socket) {
  return cleanText(payload.clientId, 80) || socket.id;
}

function attachSocketToPlayer(socket, room, playerId, name = '') {
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;

  const player = room.players[playerId];
  if (player) {
    player.socketId = socket.id;
    player.connected = true;
    if (!player.color) player.color = nextPlayerColor(room);
    if (name) player.name = name;
    return player;
  }

  room.players[playerId] = {
    id: playerId,
    socketId: socket.id,
    name,
    color: nextPlayerColor(room),
    assignedWord: '',
    score: 0,
    ready: false,
    connected: true,
    joinedAt: Date.now(),
  };
  return room.players[playerId];
}

function scheduleEmptyRoomCleanup(room) {
  if (activePlayers(room).length > 0 || room.emptyTimer) return;
  room.emptyTimer = setTimeout(() => {
    if (rooms[room.code] && activePlayers(room).length === 0) {
      clearRoomTimer(room);
      delete rooms[room.code];
    }
  }, EMPTY_ROOM_TTL_MS);
}

function cancelEmptyRoomCleanup(room) {
  if (room?.emptyTimer) clearTimeout(room.emptyTimer);
  if (room) room.emptyTimer = null;
}

io.on('connection', (socket) => {
  socket.emit('server-ready', { id: socket.id });

  socket.on('create-room', (payload = {}, ack = () => {}) => {
    const name = cleanText(payload.name, 24);
    const playerId = ensurePlayerId(payload, socket);
    if (!name) {
      ack({ ok: false, error: 'Oyuncu adı gerekli.' });
      return;
    }

    const requestedCode = normalizeCode(payload.code);
    const code = requestedCode || createRoomCode();
    if (requestedCode && requestedCode.length < 3) {
      ack({ ok: false, error: 'Oda kodu en az 3 karakter olmalı.' });
      return;
    }
    if (rooms[code]) {
      ack({ ok: false, error: 'Bu oda kodu zaten aktif. Katılmayı deneyebilir ya da başka kod yazabilirsin.' });
      return;
    }

    rooms[code] = {
      code,
      hostId: playerId,
      phase: 'lobby',
      roundNumber: 1,
      players: {},
      mainWord: '',
      differentWord: '',
      differentPlayerId: '',
      votes: {},
      guesses: {},
      winner: null,
      resultReason: '',
      drawingHistory: [],
      roundHistory: [],
      settings: { ...DEFAULT_SETTINGS },
      phaseEndsAt: null,
      phaseDuration: 0,
      timerInterval: null,
      currentTurnIndex: 0,
      currentTurnPlayerId: '',
      currentTurnId: '',
      turnCounts: {},
      turnEndsAt: null,
      turnDuration: 0,
      emptyTimer: null,
      createdAt: Date.now(),
    };

    const room = rooms[code];
    attachSocketToPlayer(socket, room, playerId, name);
    ack({ ok: true, code, playerId });
    emitRoomState(room);
    socket.emit('drawing-history', room.drawingHistory);
  });

  socket.on('join-room', (payload = {}, ack = () => {}) => {
    const code = normalizeCode(payload.code);
    const name = cleanText(payload.name, 24);
    const playerId = ensurePlayerId(payload, socket);
    const room = getRoomByCode(code);

    if (!code || !room) {
      ack({ ok: false, error: 'Bu kodla aktif oda bulunamadı.' });
      return;
    }
    if (!name) {
      ack({ ok: false, error: 'Oyuncu adı gerekli.' });
      return;
    }

    const existingPlayer = room.players[playerId];
    if (room.phase !== 'lobby' && !existingPlayer) {
      ack({ ok: false, error: 'Bu tur başladı. Yeni turda katılabilirsin.' });
      return;
    }

    const duplicateName = Object.values(room.players).some((player) => (
      player.id !== playerId && player.connected && player.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR')
    ));
    if (duplicateName) {
      ack({ ok: false, error: 'Bu isim odada zaten kullanılıyor.' });
      return;
    }

    cancelEmptyRoomCleanup(room);
    attachSocketToPlayer(socket, room, playerId, name);
    ack({ ok: true, code, playerId });
    emitRoomMessage(room, existingPlayer ? `${name} geri döndü.` : `${name} odaya katıldı.`);
    emitRoomState(room);
    socket.emit('drawing-history', room.drawingHistory);
  });

  socket.on('resume-room', (payload = {}, ack = () => {}) => {
    const room = getRoomByCode(payload.code);
    const playerId = ensurePlayerId(payload, socket);
    const player = room?.players[playerId];
    if (!room || !player) {
      ack({ ok: false });
      return;
    }

    cancelEmptyRoomCleanup(room);
    attachSocketToPlayer(socket, room, playerId, player.name);
    ack({ ok: true, code: room.code, playerId });
    emitRoomMessage(room, `${player.name} geri bağlandı.`);
    emitRoomState(room);
    socket.emit('drawing-history', room.drawingHistory);
  });

  socket.on('toggle-ready', () => {
    const room = getRoomBySocket(socket);
    const player = room?.players[socket.data.playerId];
    if (!room || !player || room.phase !== 'lobby') return;
    player.ready = !player.ready;
    emitRoomState(room);
  });

  socket.on('update-settings', (payload = {}) => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'lobby') return;
    room.settings = normalizeSettings(room.settings, payload);
    emitRoomState(room);
  });

  socket.on('start-game', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'lobby') return;

    const players = activePlayers(room);
    if (players.length < 2) {
      socket.emit('action-error', 'Oyunu başlatmak için en az 2 oyuncu gerekli.');
      return;
    }
    if (!allNonHostsReady(room)) {
      socket.emit('action-error', 'Başlamak için tüm oyuncular hazır olmalı.');
      return;
    }

    const wordPair = pickWordPair(room);
    const differentPlayer = players[Math.floor(Math.random() * players.length)];
    room.differentPlayerId = differentPlayer.id;
    room.mainWord = wordPair.mainWord;
    room.differentWord = wordPair.differentWord;
    room.votes = {};
    room.guesses = {};
    room.winner = null;
    room.resultReason = '';
    room.phase = 'drawing';
    room.drawingHistory = [];
    resetTurnState(room);

    Object.values(room.players).forEach((player) => {
      player.assignedWord = player.id === room.differentPlayerId ? room.differentWord : room.mainWord;
    });

    io.to(room.code).emit('canvas-cleared');
    const drawingDuration = Math.max(room.settings.drawingSeconds, players.length * TURNS_PER_PLAYER * room.settings.turnSeconds + 5);
    startPhaseTimer(room, drawingDuration, () => {
      if (room.phase !== 'voting') return;
      resolveVoting(room, 'voting_timeout');
      emitRoomState(room);
      emitRoomMessage(room, 'Oylama süresi bitti. Sonuçlar açıldı.');
    });
    emitRoomState(room);
    emitRoomMessage(room, 'Gizli kelimeler dağıtıldı. Çizim başladı.');
  });

  socket.on('draw', (rawOp) => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !canPlayerDraw(room, playerId)) return;

    const op = normalizeDrawingOp(rawOp, room.players[playerId], room);
    room.drawingHistory.push(op);
    if (room.drawingHistory.length > MAX_DRAWING_OPS) {
      room.drawingHistory.splice(0, room.drawingHistory.length - MAX_DRAWING_OPS);
    }
    socket.to(room.code).emit('draw-op', op);
  });

  socket.on('undo-stroke', () => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !canPlayerDraw(room, playerId)) return;

    const lastOwnOp = [...room.drawingHistory].reverse().find((op) => op.playerId === playerId && (op.turnId || op.strokeId));
    if (!lastOwnOp) return;

    if (lastOwnOp.turnId) {
      room.drawingHistory = room.drawingHistory.filter((op) => !(op.playerId === playerId && op.turnId === lastOwnOp.turnId));
    } else {
      room.drawingHistory = room.drawingHistory.filter((op) => !(op.playerId === playerId && op.strokeId === lastOwnOp.strokeId));
    }
    io.to(room.code).emit('drawing-history', room.drawingHistory);
    emitRoomState(room);
  });

  socket.on('finish-turn', () => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !canPlayerDraw(room, playerId)) return;
    advanceTurn(room);
  });

  socket.on('clear-canvas', () => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !canPlayerDraw(room, playerId)) return;

    room.drawingHistory = room.drawingHistory.filter((op) => !(op.playerId === playerId && op.turnId === room.currentTurnId));
    io.to(room.code).emit('drawing-history', room.drawingHistory);
    emitRoomState(room);
  });

  socket.on('submit-vote', (targetId) => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    if (!room || room.phase !== 'voting' || !room.players[playerId]?.connected) return;
    if (!room.players[targetId]) {
      socket.emit('action-error', 'Geçerli bir oyuncu seçmelisin.');
      return;
    }
    if (targetId === playerId) {
      socket.emit('action-error', 'Kendine oy veremezsin.');
      return;
    }
    if (room.votes[playerId]) return;

    room.votes[playerId] = targetId;
    const eligibleVoters = connectedPlayerIds(room);
    const allPlayersVoted = eligibleVoters.every((id) => room.votes[id]);
    if (allPlayersVoted) resolveVoting(room);
    emitRoomState(room);
  });

  socket.on('submit-guess', (payload = {}) => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    const player = room?.players[playerId];
    if (!room || !player || !room.settings.oddGuessEnabled) return;
    if (room.phase !== 'drawing' && room.phase !== 'voting') return;
    if (room.guesses[playerId]) return;

    const guess = cleanText(payload.guess, 32);
    if (!guess) return;
    room.guesses[playerId] = guess;

    if (playerId === room.differentPlayerId && normalizeGuess(guess) === normalizeGuess(room.mainWord)) {
      resolveDifferentGuess(room);
      emitRoomState(room);
      emitRoomMessage(room, `${player.name} ana kelimeyi tahmin etti.`);
      return;
    }

    socket.emit('guess-result', { ok: true, correct: false });
    emitRoomState(room);
  });

  socket.on('reveal-results', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'voting') return;
    resolveVoting(room, 'host_revealed');
    emitRoomState(room);
  });

  socket.on('new-round', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'result') return;
    resetRound(room);
    room.roundNumber += 1;
    io.to(room.code).emit('canvas-cleared');
    emitRoomState(room);
    emitRoomMessage(room, 'Yeni tur için oda hazır.');
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.players[playerId]) return;

    const leavingPlayer = room.players[playerId];
    leavingPlayer.connected = false;
    leavingPlayer.socketId = null;

    const connectedIds = connectedPlayerIds(room);
    if (!connectedIds.length) {
      scheduleEmptyRoomCleanup(room);
      return;
    }

    if (room.hostId === playerId) {
      room.hostId = connectedIds[0];
      emitRoomMessage(room, `${room.players[room.hostId].name} yeni host oldu.`);
    }

    if (room.phase === 'drawing' && room.currentTurnPlayerId === playerId) {
      advanceTurn(room, false);
    }

    emitRoomState(room);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Kim Farkli server listening on port ${PORT}`);
});
