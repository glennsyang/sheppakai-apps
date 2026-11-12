import { z } from 'zod';

export const PASSKEY_NAME_MAX = 50;

export const renamePasskeySchema = z.object({
	id: z.string().min(1, 'Passkey ID is required'),
	name: z
		.string()
		.trim()
		.min(1, 'Give the passkey a name')
		.max(PASSKEY_NAME_MAX, `Keep it under ${PASSKEY_NAME_MAX} characters`)
});

export const removePasskeySchema = z.object({
	id: z.string().min(1, 'Passkey ID is required')
});
