-- Migration: Backfill recurring history (#240)
-- Description: Every existing recurring bill gets one open version starting at its
--              created_at month, with its current amount and cadence. Bills currently
--              marked paid get a payment row for the current period (YYYY-MM for
--              Monthly, YYYY for Yearly) so the paid flag carries over before 0022
--              drops the `paid` column. Periods use UTC-8 as an approximation of
--              Pacific time; ids reuse SQLite's randomblob since there is no UUID().
-- Date: 2026-11-09

INSERT INTO `recurring_version` (`id`, `recurring_id`, `amount`, `cadence`, `effective_from`, `effective_to`)
SELECT lower(hex(randomblob(16))), `id`, `amount`, `cadence`, strftime('%Y-%m', `created_at`, 'unixepoch', '-8 hours'), NULL
FROM `recurring`;
--> statement-breakpoint
INSERT INTO `recurring_payment` (`id`, `recurring_id`, `period`, `paid_at`)
SELECT lower(hex(randomblob(16))), `id`,
	CASE WHEN `cadence` = 'Yearly'
		THEN strftime('%Y', 'now', '-8 hours')
		ELSE strftime('%Y-%m', 'now', '-8 hours')
	END,
	CAST(strftime('%s', 'now') AS integer)
FROM `recurring`
WHERE `paid` = 1;
