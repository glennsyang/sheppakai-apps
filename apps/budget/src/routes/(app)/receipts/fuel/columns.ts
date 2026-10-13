import { createReceiptColumns } from '#lib/utils/receipt-columns.js';

export const columns = createReceiptColumns(
	'/receipts/fuel?/delete',
	'Are you sure you want to delete this fuel receipt?'
);
