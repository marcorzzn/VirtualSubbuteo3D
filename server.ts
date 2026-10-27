import express from 'express';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

interface RoomPlayer {
  socketId: string;
  name: string;
  team: 'home' | 'away' | 'spectator';
}

interface GameRoom {
  roomId: string;
  roomName: string;
  hostSocketId: string;
  hostName: string;
  guestSocketId: string | null;
  guestName: string | null;
  players: Map<string, RoomPlayer>;
  scoreHome: number;
  scoreAway: number;
  status: 'waiting' | 'playing' | 'finished';
  lastState: unknown | null;
  processedEventIds: Set<string>;
}

function getLocalLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const rooms = new Map<string, GameRoom>();

  function getRoomsSummary() {
    return Array.from(rooms.values()).map((r) => {
      let spectatorCount = 0;
      r.players.forEach((p) => {
        if (p.team === 'spectator') spectatorCount++;
      });
      const playerCount = (r.hostSocketId ? 1 : 0) + (r.guestSocketId ? 1 : 0);
      return {
        roomId: r.roomId,
        roomName: r.roomName,
        hostName: r.hostName,
        guestName: r.guestName,
        playerCount,
        spectatorCount,
        scoreHome: r.scoreHome,
        scoreAway: r.scoreAway,
        status: r.status,
        isLanReady: true,
      };
    });
  }

  function broadcastLobbyRooms() {
    io.emit('lobby:rooms_updated', getRoomsSummary());
  }

  // API endpoint for LAN / Server info
  app.get('/api/network-info', (_req, res) => {
    res.json({
      lanAddresses: getLocalLanAddresses(),
      port: 3000,
      appUrl: process.env.APP_URL || '',
      activeRooms: getRoomsSummary().length,
      protocol: 'FISTF Sport Rules V5.3 Real-Time Sync',
    });
  });

  io.on('connection', (socket) => {
    socket.emit('lobby:rooms_updated', getRoomsSummary());

    socket.on('lobby:list', () => {
      socket.emit('lobby:rooms_updated', getRoomsSummary());
    });

    socket.on(
      'room:create',
      (
        payload: { roomId?: string; roomName?: string; playerName?: string },
        cb?: (res: { ok: boolean; roomId: string; role: 'home' | 'away' | 'spectator'; error?: string }) => void
      ) => {
        const cleanId = (
          payload.roomId?.trim().toUpperCase() ||
          `FISTF-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
        ).slice(0, 14);

        if (rooms.has(cleanId)) {
          cb?.({ ok: false, roomId: cleanId, role: 'spectator', error: 'Codice stanza già esistente' });
          return;
        }

        const playerName = (payload.playerName || 'Capitano Azzurri').slice(0, 24);
        const roomName = (payload.roomName || `Tavolo ${cleanId}`).slice(0, 32);

        const newRoom: GameRoom = {
          roomId: cleanId,
          roomName,
          hostSocketId: socket.id,
          hostName: playerName,
          guestSocketId: null,
          guestName: null,
          players: new Map([[socket.id, { socketId: socket.id, name: playerName, team: 'home' }]]),
          scoreHome: 0,
          scoreAway: 0,
          status: 'waiting',
          lastState: null,
          processedEventIds: new Set(),
        };

        rooms.set(cleanId, newRoom);
        socket.join(cleanId);

        cb?.({ ok: true, roomId: cleanId, role: 'home' });
        io.to(cleanId).emit('room:joined', {
          roomId: cleanId,
          roomName,
          hostName: newRoom.hostName,
          guestName: newRoom.guestName,
          status: newRoom.status,
        });
        broadcastLobbyRooms();
      }
    );

    socket.on(
      'room:join',
      (
        payload: { roomId: string; playerName?: string; asSpectator?: boolean },
        cb?: (res: {
          ok: boolean;
          roomId: string;
          role: 'home' | 'away' | 'spectator';
          hostName?: string;
          guestName?: string | null;
          lastState?: unknown;
          error?: string;
        }) => void
      ) => {
        const cleanId = payload.roomId?.trim().toUpperCase();
        const room = rooms.get(cleanId);
        if (!room) {
          cb?.({ ok: false, roomId: cleanId, role: 'spectator', error: 'Stanza non trovata' });
          return;
        }

        // Idempotency guard if already in room
        const existingPlayer = room.players.get(socket.id);
        if (existingPlayer) {
          socket.join(cleanId);
          cb?.({
            ok: true,
            roomId: cleanId,
            role: existingPlayer.team,
            hostName: room.hostName,
            guestName: room.guestName,
            lastState: room.lastState,
          });
          return;
        }

        const playerName = (payload.playerName || 'Sfidante Rosso').slice(0, 24);
        let assignedRole: 'home' | 'away' | 'spectator' = 'spectator';

        if (!payload.asSpectator && !room.guestSocketId) {
          room.guestSocketId = socket.id;
          room.guestName = playerName;
          room.status = 'playing';
          assignedRole = 'away';
        }

        room.players.set(socket.id, {
          socketId: socket.id,
          name: playerName,
          team: assignedRole,
        });

        socket.join(cleanId);

        cb?.({
          ok: true,
          roomId: cleanId,
          role: assignedRole,
          hostName: room.hostName,
          guestName: room.guestName,
          lastState: room.lastState,
        });

        io.to(cleanId).emit('room:joined', {
          roomId: cleanId,
          roomName: room.roomName,
          hostName: room.hostName,
          guestName: room.guestName,
          status: room.status,
        });

        broadcastLobbyRooms();
      }
    );

    socket.on('match:flick', (payload: { roomId: string; eventId: string; action: unknown }) => {
      const room = rooms.get(payload.roomId);
      if (!room) return;
      if (room.processedEventIds.has(payload.eventId)) return;
      room.processedEventIds.add(payload.eventId);
      if (room.processedEventIds.size > 200) {
        const first = room.processedEventIds.values().next().value;
        if (first) room.processedEventIds.delete(first);
      }
      socket.to(payload.roomId).emit('match:remote_flick', payload.action);
    });

    socket.on('match:skip_defense', (payload: { roomId: string; eventId: string }) => {
      const room = rooms.get(payload.roomId);
      if (!room) return;
      if (room.processedEventIds.has(payload.eventId)) return;
      room.processedEventIds.add(payload.eventId);
      socket.to(payload.roomId).emit('match:remote_skip_defense');
    });

    socket.on(
      'match:sync_state',
      (payload: { roomId: string; state: { scoreHome?: number; scoreAway?: number } & Record<string, unknown> }) => {
        const room = rooms.get(payload.roomId);
        if (!room) return;
        room.lastState = payload.state;
        if (typeof payload.state.scoreHome === 'number') room.scoreHome = payload.state.scoreHome;
        if (typeof payload.state.scoreAway === 'number') room.scoreAway = payload.state.scoreAway;
        socket.to(payload.roomId).emit('match:remote_sync_state', payload.state);
        broadcastLobbyRooms();
      }
    );

    socket.on('room:leave', (payload: { roomId: string }) => {
      handleLeaveRoom(socket.id, payload.roomId);
      socket.leave(payload.roomId);
    });

    socket.on('disconnect', () => {
      for (const roomId of Array.from(rooms.keys())) {
        handleLeaveRoom(socket.id, roomId);
      }
    });
  });

  function handleLeaveRoom(socketId: string, roomId: string) {
    const room = rooms.get(roomId);
    if (!room || !room.players.has(socketId)) return;

    room.players.delete(socketId);

    if (room.hostSocketId === socketId) {
      // Promote guest or close room
      if (room.guestSocketId && room.players.has(room.guestSocketId)) {
        room.hostSocketId = room.guestSocketId;
        room.hostName = room.guestName || 'Capitano';
        const promoted = room.players.get(room.hostSocketId);
        if (promoted) promoted.team = 'home';
        room.guestSocketId = null;
        room.guestName = null;
        room.status = 'waiting';
        io.to(roomId).emit('room:player_left', {
          roomId,
          hostName: room.hostName,
          guestName: null,
          status: room.status,
          promotedToHome: room.hostSocketId,
        });
      } else {
        rooms.delete(roomId);
      }
    } else if (room.guestSocketId === socketId) {
      room.guestSocketId = null;
      room.guestName = null;
      room.status = 'waiting';
      io.to(roomId).emit('room:player_left', {
        roomId,
        hostName: room.hostName,
        guestName: null,
        status: room.status,
      });
    }

    broadcastLobbyRooms();
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Virtual Subbuteo FISTF Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
