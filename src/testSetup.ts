import { mock } from 'bun:test';

// sveltekit virtual modules don't exist under bun test
mock.module('$env/dynamic/private', () => ({ env: process.env }));
mock.module('$env/dynamic/public', () => ({ env: process.env }));
mock.module('$app/environment', () => ({ dev: true, browser: false, building: false }));
