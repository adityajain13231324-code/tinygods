import Peer from 'peerjs';
import { RelayPeer } from './relayPeer.js';

// One place decides how browsers reach each other. With a relay URL (VITE_RELAY_URL at build time,
// window.TG_RELAY_URL, or ?relay=wss://... for testing) every room goes through our WebSocket relay, which
// works on any network. With ?relay=off the game uses direct WebRTC through PeerJS instead.

const fromQuery = () => { try { return new URLSearchParams(globalThis.location?.search ?? '').get('relay') || ''; } catch { return ''; } };
// The live relay (relay/, deployed on Render). Override with VITE_RELAY_URL, window.TG_RELAY_URL or ?relay=wss://..., or use ?relay=off for direct WebRTC.
export const DEFAULT_RELAY = 'wss://tiny-gods-relay.onrender.com';
export const relayUrl = () => {
  const q = fromQuery();
  if (q === 'off') return '';
  return String(q || globalThis.TG_RELAY_URL || import.meta.env?.VITE_RELAY_URL || DEFAULT_RELAY).trim();
};
export const usingRelay = () => !!relayUrl();

/** A host passes the room id it wants; a guest passes null. `ice` is only used for WebRTC. */
export function makePeer(id, ice) {
  const url = relayUrl();
  if (url) return new RelayPeer(id, url);
  return id ? new Peer(id, { config: ice, debug: 1 }) : new Peer({ config: ice, debug: 1 });
}
