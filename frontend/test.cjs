const { io } = require('socket.io-client');

const ROOM_ID = 'testroom';
const URL = 'http://localhost:3001';

const createClient = (name, peerId) => {
  return new Promise((resolve) => {
    const socket = io(URL, { transports: ['websocket'] });
    socket.on('connect', () => {
      console.log(`[${name}] Connected with socket ID:`, socket.id);
      socket.emit('join-room', ROOM_ID, peerId, name, 0);
    });

    socket.on('room-info', (info) => {
      console.log(`[${name}] Room Info received. Admin:`, info.admin);
      resolve({ socket, info, name, peerId });
    });

    socket.on('game-started', (data) => {
       console.log(`[${name}] -> GAME STARTED! Phase: ${data.phase}`);
    });

    socket.on('role-assigned', (role) => {
       console.log(`[${name}] -> ROLE ASSIGNED: ${role}`);
    });

    socket.on('custom-roles-updated', (m) => console.log('['+name+'] -> CUSTOM ROLES UPDATED:', m)); socket.on('phase-changed', (phase) => {
       console.log(`[${name}] -> Phase changed to: ${phase}`);
    });
  });
};

const run = async () => {
  console.log('Starting Test Clients...');
  const admin = await createClient('Alice_Admin', 'peer-1');
  const mod   = await createClient('Bob_Mod', 'peer-2');
  const p3    = await createClient('Charlie', 'peer-3');
  const p4    = await createClient('David', 'peer-4');

  await new Promise(r => setTimeout(r, 1000));

  console.log('\n--- Admin updating settings ---');
  admin.socket.emit('update-settings', { modEnabled: true, vampireCount: 1, healerEnabled: true, dayDuration: 2, nightDuration: 2, dawnDuration: 2 });
  
  await new Promise(r => setTimeout(r, 100));

  console.log('\n--- Admin mapping Mod ---');
  admin.socket.emit('assign-moderator', mod.peerId);

  await new Promise(r => setTimeout(r, 500));

  console.log('\n--- Mod submitting custom roles & Admin starting game ---');
  // Mod sets roles: Admin -> Villager, P3 -> Healer, P4 -> Vampire
  mod.socket.emit('update-custom-roles', { targetId: admin.peerId, role: 'villager' });
  mod.socket.emit('update-custom-roles', { targetId: p3.peerId, role: 'healer' });
  mod.socket.emit('update-custom-roles', { targetId: p4.peerId, role: 'vampire' });

  await new Promise(r => setTimeout(r, 500));

  // Admin starts game
  admin.socket.emit('start-game', {});

  await new Promise(r => setTimeout(r, 20000));
  
  console.log('Done.');
  process.exit(0);
};

run();
