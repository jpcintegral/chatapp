import { io } from 'socket.io-client';

export const socket = io('https://chatback.devscolima.com', {
  transports: ['websocket'],
  autoConnect: true, // se conecta una sola vez
  forceNew: false, // evita conexiones múltiples
  reconnection: true,
});
