// Deprecated alias for `/api/v1/expenses` (#321), kept for one release so existing callers
// keep working. Remove once nothing calls the old path.
export { GET, POST } from '../expenses/+server';
