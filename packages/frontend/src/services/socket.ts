import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

let socket: Socket | null = null;

export function connectSocket() {
  const token = useAuthStore.getState().token;

  if (!token) {
    console.warn('Cannot connect socket: no token');
    return;
  }

  if (socket?.connected) {
    return socket;
  }

  socket = io('http://localhost:3001', {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  // Game events
  socket.on('building:complete', (data) => {
    console.log('Building complete:', data);
    const { villageId, slot, type, level } = data;
    useGameStore.getState().updateBuilding(villageId, slot, {
      type,
      level,
      upgradeEndsAt: null,
    });
  });

  socket.on('field:complete', (data) => {
    console.log('Field complete:', data);
    const { villageId, slot, type, level } = data;
    useGameStore.getState().updateResourceField(villageId, slot, {
      type,
      level,
      upgradeEndsAt: null,
    });
  });

  socket.on('resources:update', (data) => {
    console.log('Resources update:', data);
    const { villageId, resources } = data;
    useGameStore.getState().updateResources(villageId, resources);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinVillage(villageId: string) {
  if (socket?.connected) {
    socket.emit('join:village', villageId);
  }
}

export function leaveVillage(villageId: string) {
  if (socket?.connected) {
    socket.emit('leave:village', villageId);
  }
}

export function getSocket(): Socket | null {
  return socket;
}
