import { BETTER_AUTH_BASE_URL } from '$app/env/private';
import { createWelcomeSender } from '@sheppakai/shared/welcome';

import { auth } from '../auth';
import { sendWelcomeEmail } from '../email';

/** Mints a 72-hour set-password link and sends the welcome email. Throws if the send fails. */
export const sendWelcome = createWelcomeSender({
	auth,
	baseUrl: BETTER_AUTH_BASE_URL,
	sendWelcomeEmail
});
