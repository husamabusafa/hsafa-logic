// Spaces server — serves both auth AND the spaces API.
// Change this to your server's LAN IP for physical device testing.
// Use localhost for simulator.
// Use cloudflared tunnel for HTTPS (required for Google OAuth on mobile).
// For local-only testing, swap to: http://192.168.100.71:3005

// Use production URL for TestFlight/App Store builds
// Use local IP for development

// TEMPORARY: Force local IP for testing (remove this line for production)
export const SERVER_URL = 'http://192.168.100.71:3005';
export const API_BASE = `${SERVER_URL}/api`;

// Debug logging
console.log('[CONFIG] SERVER_URL:', SERVER_URL);
