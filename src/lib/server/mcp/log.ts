// never log a raw token, only its last four characters
export function mlog(scope: string, message: string, extra?: Record<string, unknown>): void {
	const tail = extra && Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
	console.log(`[mcp:${scope}] ${message}${tail}`);
}

export function tail4(secret: string | null | undefined): string {
	return secret ? `…${secret.slice(-4)}` : '(none)';
}
