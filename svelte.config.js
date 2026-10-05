import { existsSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';

// setting ARI_PUBLIC_BUILD=1 builds against the stub even when the private checkout is present
const privateDir =
	process.env.ARI_PUBLIC_BUILD !== '1' && existsSync('private/web/index.ts')
		? 'private/web'
		: 'src/lib/privateStub';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// force runes mode except for libraries. can be removed in svelte 6
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		alias: {
			$private: privateDir,
			'$private/*': `${privateDir}/*`,
			$db: 'generated/prisma/client'
		},
		// sveltekit's origin check rejects no-origin posts like /oauth/token, so it is off here
		// and re-applied for the cookie surface in hooks.server.ts
		csrf: { trustedOrigins: ['*'] }
	}
};

export default config;
