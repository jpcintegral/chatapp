import { io } from 'socket.io-client';

export const socket = io('http://192.168.1.66:3100', {
  transports: ['websocket'],
  autoConnect: true, // se conecta una sola vez
  forceNew: false, // evita conexiones múltiples
  reconnection: true,
});
