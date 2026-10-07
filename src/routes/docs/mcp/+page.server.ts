import { baseUrl } from '$lib/server/mcp/oauth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({ endpoint: `${baseUrl(url.origin)}/api/mcp` });
