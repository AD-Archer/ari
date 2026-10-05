import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

// only under `vite dev`: production builds never enable it, whatever the env says
export const devLoginEnabled = () => dev && env.DEV_LOGIN === 'true';
