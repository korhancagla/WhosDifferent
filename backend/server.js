const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const rooms = {};
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_DRAWING_OPS = 25000;

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
  return cleanText(value, 16).toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function roomPlayers(room) {
  return Object.values(room.players)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.id === room.hostId,
      hasVoted: !!room.votes[player.id],
    }));
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

function buildRoomState(room, viewerId) {
  const viewer = room.players[viewerId];
  const isHost = viewerId === room.hostId;
  const resultVisible = room.phase === 'result';

  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: roomPlayers(room),
    me: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          isHost,
          word: viewer.assignedWord || '',
          votedFor: room.votes[viewer.id] || '',
        }
      : null,
    hostSetup: isHost
      ? {
          words: room.words,
          mainWord: room.mainWord,
          differentWord: room.differentWord,
        }
      : null,
    result: resultVisible
      ? {
          differentPlayerId: room.differentPlayerId,
          differentPlayerName: room.players[room.differentPlayerId]?.name || 'Ayrılan oyuncu',
          mainWord: room.mainWord,
          differentWord: room.differentWord,
          winner: room.winner,
          voteCounts: voteCounts(room),
          votes: translatedVotes(room),
        }
      : null,
  };
}

function emitRoomState(room) {
  if (!room) return;
  Object.keys(room.players).forEach((playerId) => {
    io.to(playerId).emit('room-state', buildRoomState(room, playerId));
  });
}

function emitRoomMessage(room, message) {
  if (room) io.to(room.code).emit('room-message', message);
}

function resetRound(room, keepWords = true) {
  room.phase = 'lobby';
  room.differentPlayerId = '';
  room.votes = {};
  room.winner = null;
  room.drawingHistory = [];
  if (!keepWords) {
    room.words = ['', '', '', ''];
    room.mainWord = '';
    room.differentWord = '';
  }
  Object.values(room.players).forEach((player) => {
    player.assignedWord = '';
  });
}

function resolveVoting(room) {
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
}

function getRoomBySocket(socket) {
  const code = socket.data.roomCode;
  if (!code) return null;
  return rooms[code] || null;
}

function assertHost(socket, room) {
  return room && room.hostId === socket.id;
}

function normalizeDrawingOp(rawOp) {
  const mode = rawOp?.mode === 'eraser' ? 'eraser' : 'pen';
  const size = Math.min(Math.max(Number(rawOp?.size) || 4, 1), 64);
  const color = /^#[0-9a-f]{6}$/i.test(rawOp?.color || '') ? rawOp.color : '#111827';

  const point = (value) => ({
    x: Math.min(Math.max(Number(value?.x) || 0, 0), 1),
    y: Math.min(Math.max(Number(value?.y) || 0, 0), 1),
  });

  return {
    from: point(rawOp?.from),
    to: point(rawOp?.to),
    color,
    size,
    mode,
  };
}

io.on('connection', (socket) => {
  socket.emit('server-ready', { id: socket.id });

  socket.on('create-room', (payload = {}, ack = () => {}) => {
    const name = cleanText(payload.name, 24);
    if (!name) {
      ack({ ok: false, error: 'Oyuncu adı gerekli.' });
      return;
    }

    const code = createRoomCode();
    rooms[code] = {
      code,
      hostId: socket.id,
      phase: 'lobby',
      players: {},
      words: ['', '', '', ''],
      mainWord: '',
      differentWord: '',
      differentPlayerId: '',
      votes: {},
      winner: null,
      drawingHistory: [],
      createdAt: Date.now(),
    };

    socket.join(code);
    socket.data.roomCode = code;
    rooms[code].players[socket.id] = {
      id: socket.id,
      name,
      assignedWord: '',
      joinedAt: Date.now(),
    };

    ack({ ok: true, code, playerId: socket.id });
    emitRoomState(rooms[code]);
    socket.emit('drawing-history', rooms[code].drawingHistory);
  });

  socket.on('join-room', (payload = {}, ack = () => {}) => {
    const code = normalizeCode(payload.code);
    const name = cleanText(payload.name, 24);
    const room = rooms[code];

    if (!code || !room) {
      ack({ ok: false, error: 'Bu kodla aktif oda bulunamadı.' });
      return;
    }

    if (!name) {
      ack({ ok: false, error: 'Oyuncu adı gerekli.' });
      return;
    }

    if (room.phase !== 'lobby') {
      ack({ ok: false, error: 'Bu tur başladı. Yeni turda katılabilirsin.' });
      return;
    }

    const duplicateName = Object.values(room.players).some((player) => player.name.toLowerCase() === name.toLowerCase());
    if (duplicateName) {
      ack({ ok: false, error: 'Bu isim odada zaten kullanılıyor.' });
      return;
    }

    socket.join(code);
    socket.data.roomCode = code;
    room.players[socket.id] = {
      id: socket.id,
      name,
      assignedWord: '',
      joinedAt: Date.now(),
    };

    ack({ ok: true, code, playerId: socket.id });
    emitRoomMessage(room, `${name} odaya katıldı.`);
    emitRoomState(room);
    socket.emit('drawing-history', room.drawingHistory);
  });

  socket.on('update-words', (payload = {}) => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'lobby') return;

    const incomingWords = Array.isArray(payload.words) ? payload.words : [];
    const words = incomingWords.slice(0, 6).map((word) => cleanText(word, 32));
    while (words.length < 4) words.push('');

    room.words = words;
    room.mainWord = cleanText(payload.mainWord, 32);
    room.differentWord = cleanText(payload.differentWord, 32);
    emitRoomState(room);
  });

  socket.on('start-game', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'lobby') return;

    const players = Object.values(room.players);
    if (players.length < 2) {
      socket.emit('action-error', 'Oyunu başlatmak için en az 2 oyuncu gerekli.');
      return;
    }

    if (!room.mainWord || !room.differentWord || room.mainWord === room.differentWord) {
      socket.emit('action-error', 'Ana kelime ve farklı kelime seçili, birbirinden ayrı olmalı.');
      return;
    }

    const differentPlayer = players[Math.floor(Math.random() * players.length)];
    room.differentPlayerId = differentPlayer.id;
    room.votes = {};
    room.winner = null;
    room.phase = 'drawing';
    room.drawingHistory = [];

    players.forEach((player) => {
      player.assignedWord = player.id === room.differentPlayerId ? room.differentWord : room.mainWord;
    });

    io.to(room.code).emit('canvas-cleared');
    emitRoomState(room);
    emitRoomMessage(room, 'Kelimeler dağıtıldı. Çizim başladı.');
  });

  socket.on('draw', (rawOp) => {
    const room = getRoomBySocket(socket);
    if (!room || room.phase !== 'drawing' || !room.players[socket.id]) return;

    const op = normalizeDrawingOp(rawOp);
    room.drawingHistory.push(op);
    if (room.drawingHistory.length > MAX_DRAWING_OPS) {
      room.drawingHistory.splice(0, room.drawingHistory.length - MAX_DRAWING_OPS);
    }
    socket.to(room.code).emit('draw-op', op);
  });

  socket.on('clear-canvas', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room)) return;
    room.drawingHistory = [];
    io.to(room.code).emit('canvas-cleared');
  });

  socket.on('go-to-voting', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'drawing') return;
    room.phase = 'voting';
    room.votes = {};
    emitRoomState(room);
    emitRoomMessage(room, 'Oylama başladı.');
  });

  socket.on('submit-vote', (targetId) => {
    const room = getRoomBySocket(socket);
    if (!room || room.phase !== 'voting' || !room.players[socket.id]) return;
    if (!room.players[targetId]) {
      socket.emit('action-error', 'Geçerli bir oyuncu seçmelisin.');
      return;
    }
    if (targetId === socket.id) {
      socket.emit('action-error', 'Kendine oy veremezsin.');
      return;
    }
    if (room.votes[socket.id]) return;

    room.votes[socket.id] = targetId;
    const allPlayersVoted = Object.keys(room.votes).length >= Object.keys(room.players).length;
    if (allPlayersVoted) resolveVoting(room);
    emitRoomState(room);
  });

  socket.on('reveal-results', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'voting') return;
    resolveVoting(room);
    emitRoomState(room);
  });

  socket.on('new-round', () => {
    const room = getRoomBySocket(socket);
    if (!assertHost(socket, room) || room.phase !== 'result') return;
    resetRound(room, true);
    io.to(room.code).emit('canvas-cleared');
    emitRoomState(room);
    emitRoomMessage(room, 'Yeni tur için oda hazır.');
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket);
    if (!room) return;

    const leavingPlayer = room.players[socket.id];
    delete room.players[socket.id];
    delete room.votes[socket.id];
    Object.entries(room.votes).forEach(([voterId, targetId]) => {
      if (targetId === socket.id) delete room.votes[voterId];
    });

    const remainingIds = Object.keys(room.players);
    if (remainingIds.length === 0) {
      delete rooms[room.code];
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = remainingIds
        .map((id) => room.players[id])
        .sort((a, b) => a.joinedAt - b.joinedAt)[0].id;
      emitRoomMessage(room, `${room.players[room.hostId].name} yeni host oldu.`);
    }

    if ((room.phase === 'drawing' || room.phase === 'voting') && socket.id === room.differentPlayerId) {
      resetRound(room, true);
      io.to(room.code).emit('canvas-cleared');
      emitRoomMessage(room, 'Farklı oyuncu ayrıldığı için tur bekleme odasına alındı.');
    } else if (leavingPlayer) {
      emitRoomMessage(room, `${leavingPlayer.name} odadan ayrıldı.`);
    }

    emitRoomState(room);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Kim Farkli server listening on port ${PORT}`);
});
