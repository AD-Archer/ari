import { env } from '$env/dynamic/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
	dsn: env.PUBLIC_SENTRY_DSN,
	tracesSampleRate: 1,
	enableLogs: true,
	ignoreErrors: [/^TypeError: (Failed to fetch|NetworkError|Load failed)/],
	integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })]
});

export const handleError = Sentry.handleErrorWithSentry();
