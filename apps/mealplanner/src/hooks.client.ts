import { SENTRY_DSN } from '$app/env/public';
import { initClientSentry } from '@sheppakai/shared/sentry-client';

export const handleError = initClientSentry({ dsn: SENTRY_DSN });
