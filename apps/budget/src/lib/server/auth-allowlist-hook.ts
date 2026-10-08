// The shared allowlist gates, with this app's operator alerts wired into the sign-in hook.
import { createAllowlistBeforeHook as createSharedBeforeHook } from '@sheppakai/shared/auth-allowlist';

import { sendAuthAlerts } from './notifications';

export {
	buildAllowlistCommand,
	createAllowlistSessionGuard,
	parseAllowedEmails
} from '@sheppakai/shared/auth-allowlist';

export function createAllowlistBeforeHook(appName: string, allowedEmails: Set<string>) {
	return createSharedBeforeHook(appName, allowedEmails, { sendAlert: sendAuthAlerts });
}
