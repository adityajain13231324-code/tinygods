import Peer from 'peerjs';
import { RelayPeer } from './relayPeer.js';

// One place decides how browsers reach each other. With a relay URL (VITE_RELAY_URL at build time,
// window.TG_RELAY_URL, or ?relay=wss://... for testing) every room goes through our WebSocket relay, which
// works on any network. Without one the game falls back to direct WebRTC through PeerJS.

const fromQuery = () => { try { return new URLSearchParams(globalThis.location?.search ?? '').get('relay') || ''; } catch { return ''; } };
export const relayUrl = () => String(fromQuery() || globalThis.TG_RELAY_URL || import.meta.env?.VITE_RELAY_URL || '').trim();
export const usingRelay = () => !!relayUrl();

/** A host passes the room id it wants; a guest passes null. `ice` is only used for WebRTC. */
export function makePeer(id, ice) {
  const url = relayUrl();
  if (url) return new RelayPeer(id, url);
  return id ? new Peer(id, { config: ice, debug: 1 }) : new Peer({ config: ice, debug: 1 });
}
