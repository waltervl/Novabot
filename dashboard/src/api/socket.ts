/**
 * Singleton Socket.io client — shared across useSocket hook and joystick commands.
 */
import { io, Socket } from 'socket.io-client';
import { getToken } from './client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // The server only enforces auth for external (public-internet) handshakes;
    // LAN/VPN connects without a token. We always send the token when we have
    // one so a logged-in external user passes the gate.
    socket = io({
      transports: ['websocket', 'polling'],
      auth: { token: getToken() || undefined },
    });
  }
  return socket;
}

// On logout / 401 the stored token is gone — drop the socket so the next
// getSocket() reconnects with the fresh (or absent) token instead of reusing a
// handshake the server will now reject.
if (typeof window !== 'undefined') {
  window.addEventListener('novabot:unauthorized', () => {
    try { socket?.disconnect(); } catch { /* already gone */ }
    socket = null;
  });
}

/** Tell server to start joystick mode */
export function joystickStart(sn: string, holdType: number): void {
  getSocket().emit('joystick:start', { sn, holdType });
}

/** Update joystick velocity — server maintains the high-frequency MQTT loop */
export function joystickMove(sn: string, holdType: number, mst: { x_w: number; y_v: number; z_g: number }): void {
  getSocket().emit('joystick:move', { sn, holdType, mst });
}

/** Tell server to stop joystick */
export function joystickStop(sn: string): void {
  getSocket().emit('joystick:stop', { sn });
}
