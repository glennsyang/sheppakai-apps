// Every admin form action goes through this: validate, reject non-admins with a form message
// (401/403), return the invalid-form message, then run the handler. Shared by every app.
import { createAdminFormAction } from '@sheppakai/shared/admin-form-action';

import { isAdminUser } from './auth-guard';

export const adminFormAction = createAdminFormAction(isAdminUser);
