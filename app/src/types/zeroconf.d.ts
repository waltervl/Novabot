/**
 * Minimal type stubs for react-native-zeroconf. The library ships no
 * .d.ts; we only need the surface used by services/discovery.ts so a
 * full DefinitelyTyped package isn't worth the hassle.
 */
declare module 'react-native-zeroconf' {
  interface ZeroconfService {
    name?: string;
    fullName?: string;
    host?: string;
    port?: number;
    addresses?: string[];
    txt?: Record<string, string>;
  }

  type ZeroconfEvent = 'start' | 'stop' | 'found' | 'resolved' | 'remove' | 'update' | 'error';

  export default class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    on(event: ZeroconfEvent, handler: (data: ZeroconfService | Error) => void): void;
    removeDeviceListeners(): void;
    publishService(type: string, protocol: string, domain: string, name: string, port: number, txt?: Record<string, string>): void;
    unpublishService(name: string): void;
    getServices(): Record<string, ZeroconfService>;
  }
}
