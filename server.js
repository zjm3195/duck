const http = require('http');
const WebSocket = require('ws');

const port = Number(process.env.PORT || 8000);
const rooms = new Map();
const sockets = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('CountDucks Douyin Cloud Hosting WebSocket Server');
});

const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', ws => {
  const client = {
    ws,
    playerId: '',
    roomId: '',
    isHost: false,
    alive: true
  };
  sockets.set(ws, client);

  ws.on('message', data => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      sendError(ws, '消息格式不是 JSON。');
      return;
    }

    client.playerId = message.playerId || client.playerId || randomId('P', 8);
    handleMessage(client, message);
  });

  ws.on('close', () => {
    leaveCurrentRoom(client);
    sockets.delete(ws);
  });

  ws.on('error', () => {
    leaveCurrentRoom(client);
    sockets.delete(ws);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.players.length === 0 || now - room.updatedAt > 30 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 60 * 1000);

function handleMessage(client, message) {
  switch (message.type) {
    case 'create_room':
      createRoom(client, message.password || '');
      break;
    case 'join_room':
      joinRoom(client, message.roomId, message.password || '');
      break;
    case 'leave_room':
      leaveCurrentRoom(client);
      break;
    case 'start_game':
    case 'duck_event':
    case 'guess':
    case 'game_result':
      relayRoomMessage(client, message);
      break;
    case 'ping':
      send(client.ws, { type: 'pong', playerId: client.playerId });
      break;
    default:
      sendError(client.ws, '未知消息类型：' + message.type);
      break;
  }
}

function createRoom(client, password) {
  leaveCurrentRoom(client);
  let roomId = randomRoomId();
  while (rooms.has(roomId)) {
    roomId = randomRoomId();
  }

  const room = {
    roomId,
    password,
    hostPlayerId: client.playerId,
    players: [client],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  client.roomId = roomId;
  client.isHost = true;
  rooms.set(roomId, room);

  sendRoomInfo(client, 'room_created', room);
}

function joinRoom(client, rawRoomId, password) {
  const roomId = normalizeRoomId(rawRoomId);
  if (!roomId) {
    sendError(client.ws, '房间号为空。');
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    sendError(client.ws, '房间不存在或已关闭。');
    return;
  }

  if (room.password !== password) {
    sendError(client.ws, '房间密码错误。');
    return;
  }

  if (room.players.length >= 2 && !room.players.some(p => p.playerId === client.playerId)) {
    sendError(client.ws, '房间已满。');
    return;
  }

  leaveCurrentRoom(client);
  client.roomId = roomId;
  client.isHost = false;
  if (!room.players.includes(client)) {
    room.players.push(client);
  }
  room.updatedAt = Date.now();

  broadcastRoomInfo(room, 'room_update');
  sendRoomInfo(client, 'room_joined', room);
}

function relayRoomMessage(client, message) {
  const room = rooms.get(client.roomId);
  if (!room) {
    sendError(client.ws, '你还不在房间内。');
    return;
  }

  if (message.type === 'start_game' && !client.isHost) {
    sendError(client.ws, '只有房主可以开始游戏。');
    return;
  }

  if (message.type === 'start_game' && room.players.length < 2) {
    sendError(client.ws, '房间未满 2 人。');
    return;
  }

  room.updatedAt = Date.now();
  broadcast(room, {
    type: message.type,
    roomId: room.roomId,
    playerId: client.playerId,
    payload: message.payload || '',
    serverTime: Date.now()
  });
}

function leaveCurrentRoom(client) {
  if (!client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (room) {
    room.players = room.players.filter(p => p !== client);
    if (room.players.length === 0) {
      rooms.delete(room.roomId);
    } else {
      if (client.isHost) {
        room.hostPlayerId = room.players[0].playerId;
        room.players[0].isHost = true;
      }
      room.updatedAt = Date.now();
      broadcastRoomInfo(room, 'room_update');
    }
  }

  client.roomId = '';
  client.isHost = false;
}

function broadcastRoomInfo(room, type) {
  for (const player of room.players) {
    sendRoomInfo(player, type, room);
  }
}

function sendRoomInfo(client, type, room) {
  send(client.ws, {
    type,
    roomId: room.roomId,
    playerId: client.playerId,
    payload: JSON.stringify({
      roomId: room.roomId,
      playerCount: room.players.length,
      isHost: client.playerId === room.hostPlayerId,
      canStart: room.players.length >= 2
    }),
    serverTime: Date.now()
  });
}

function broadcast(room, message) {
  for (const player of room.players) {
    send(player.ws, message);
  }
}

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws, message) {
  send(ws, { type: 'error', payload: message, serverTime: Date.now() });
}

function randomRoomId() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function randomId(prefix, length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = prefix;
  for (let i = 0; i < length; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function normalizeRoomId(roomId) {
  return String(roomId || '').trim().toUpperCase();
}

server.listen(port, () => {
  console.log('CountDucks cloud hosting websocket server listening on port ' + port);
});
