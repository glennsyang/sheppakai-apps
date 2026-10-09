// The shared Better Auth audit hooks, with this app's logger, welcome email and
// operator alerts wired in.
import {
	createAuthAfterHooks as createSharedAfterHooks,
	logPasswordResetAudit as logSharedPasswordResetAudit
} from '@sheppakai/shared/auth-audit-hooks';

import { sendNewUserEmail } from '../email';
import { logger } from '../logger';
import { sendAuthAlerts } from '../notifications';

export function createAuthAfterHooks(appName: string) {
	return createSharedAfterHooks(appName, { logger, sendNewUserEmail, sendAuthAlerts });
}

export function logPasswordResetAudit(user: { id: string; email: string }, appName: string) {
	logSharedPasswordResetAudit(user, appName, { logger, sendAuthAlerts });
}
