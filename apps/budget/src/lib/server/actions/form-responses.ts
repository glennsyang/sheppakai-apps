/**
 * The single validation-failure response for every non-auth form action, per
 * `docs/ERROR_HANDLING_POLICY.md`: a 400 `message(...)` that superforms turns into
 * `fail(400, { form })`, carrying field errors and a banner in one call.
 *
 * The body lives in `auth-form-handler.ts`, which matches the other apps' copies; this
 * re-export gives non-auth callers a neutral name without a second copy.
 */
export { invalidAuthForm as invalidForm } from './auth-form-handler';
