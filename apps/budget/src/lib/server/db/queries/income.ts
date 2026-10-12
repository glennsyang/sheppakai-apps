import type { Income } from '$lib/types';
import { and, asc } from 'drizzle-orm';

import { income } from '../schema';
import { dateInRange } from '../utils';
import { createQueryBuilder } from './factory';

const baseBuilder = createQueryBuilder({
	tableName: 'income',
	defaultOrderBy: [asc(income.date)]
});

export const incomeQueries = {
	...baseBuilder,

	// Find by date range (most common pattern for income)
	findByDateRange: async (startDate: string, endDate: string): Promise<Income[]> => {
		return baseBuilder.findAll({
			where: and(...dateInRange(income.date, startDate, endDate))
		});
	},

	// Find by month/year (convenience method)
	findByMonth: async (month: number, year: number): Promise<Income[]> => {
		const paddedMonth = String(month).padStart(2, '0');
		const startDate = `${year}-${paddedMonth}-01`;
		const lastDay = new Date(year, month, 0).getDate();
		const endDate = `${year}-${paddedMonth}-${lastDay}`;
		return incomeQueries.findByDateRange(startDate, endDate);
	}
};
