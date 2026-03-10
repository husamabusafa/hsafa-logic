// V5: The use-case-app serves both auth AND the spaces API.
// All API calls (messages, spaces, members, SSE) go to this URL.
export const GATEWAY_URL = 'http://192.168.100.242:3005';

// Spaces public key (for SDK auth — must match SPACES_PUBLIC_KEY in use-case-app .env)
export const PUBLIC_KEY = 'pk_spaces_dev_public_change_in_prod';

// use-case-app Next.js server (auth endpoints: /api/login, /api/register, /api/me)
export const AUTH_URL = 'http://192.168.100.242:3005';
