import { asc, sum } from 'drizzle-orm';

import { getDb } from '../index';
import { savingsAccount } from '../schema';
import { createQueryBuilder } from './factory';

const baseBuilder = createQueryBuilder({
	tableName: 'savingsAccount',
	defaultRelations: { user: true },
	defaultOrderBy: [asc(savingsAccount.title)]
});

export const savingsAccountQueries = {
	...baseBuilder,

	// Sum of all savings account balances (a running total, not date-scoped).
	getTotal: async (): Promise<number> => {
		const [row] = await getDb()
			.select({ total: sum(savingsAccount.amount) })
			.from(savingsAccount);
		return Number(row?.total ?? 0);
	}
};
