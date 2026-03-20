// Spaces server — serves both auth AND the spaces API.
// Change this to your server's LAN IP for physical device testing.
// Use localhost for simulator.
// Use cloudflared tunnel for HTTPS (required for Google OAuth on mobile).
// For local-only testing, swap to: http://192.168.100.71:3005

// Use production URL for TestFlight/App Store builds
// Use local IP for development
const IS_DEV = __DEV__;
export const SERVER_URL = IS_DEV 
  ? 'http://192.168.100.71:3005'
  : 'https://acoustic-coordination-systematic-graphic.trycloudflare.com';
export const API_BASE = `${SERVER_URL}/api`;
