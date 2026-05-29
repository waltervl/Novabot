/**
 * Socket.io client singleton for real-time communication with the OpenNova server.
 */
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Initialize the Socket.io connection to the server.
 *
 * `token` is the user's JWT, passed in the `auth` handshake payload so the
 * server can identify the user and gate per-user emits (e.g. admin-only
 * debug events). Omit when the user is not logged in yet.
 */
export function initSocket(serverUrl: string, token?: string | null): Socket {
  if (socket) {
    socket.disconnect();
  }
  socket = io(serverUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: token ? { token } : undefined,
  });
  return socket;
}

/**
 * Get the current socket instance. Returns null if not initialized.
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Disconnect and clean up the socket.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
