// environment.js
const fallbackBackendUrl = 'http://10.199.147.52:3001';

export const BACKEND_URL =
	process.env.EXPO_PUBLIC_BACKEND_URL || fallbackBackendUrl;