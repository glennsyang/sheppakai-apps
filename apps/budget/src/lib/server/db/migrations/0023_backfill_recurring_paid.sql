-- Migration: Backfill recurring paid history
-- Description: Marks every recurring bill paid for each past period it was in effect, up to
--              and including October 2026 (the last month before per-period paid state,
--              #240). Monthly bills get one row per month (YYYY-MM); Yearly bills get one row
--              per year before 2026 (YYYY). The 2026 yearly period also covers November onwards,
--              so it keeps whatever paid state it already has. The cutoff is fixed, not "now",
--              so a late deploy can't mark current months paid. Existing rows are left as-is.
-- Date: 2026-11-10

WITH RECURSIVE `months`(`recurring_id`, `period`, `last`) AS (
	SELECT `recurring_id`, `effective_from`,
		CASE WHEN `effective_to` IS NULL OR `effective_to` > '2026-10' THEN '2026-10' ELSE `effective_to` END
	FROM `recurring_version`
	WHERE `cadence` = 'Monthly' AND `effective_from` <= '2026-10'
	UNION ALL
	SELECT `recurring_id`, strftime('%Y-%m', `period` || '-01', '+1 month'), `last`
	FROM `months`
	WHERE `period` < `last`
)
INSERT INTO `recurring_payment` (`id`, `recurring_id`, `period`, `paid_at`)
SELECT lower(hex(randomblob(16))), `recurring_id`, `period`,
	CAST(strftime('%s', `period` || '-28 12:00:00') AS integer)
FROM `months`
WHERE true
ON CONFLICT (`recurring_id`, `period`) DO NOTHING;
--> statement-breakpoint
WITH RECURSIVE `years`(`recurring_id`, `period`, `last`) AS (
	SELECT `recurring_id`, substr(`effective_from`, 1, 4),
		CASE WHEN `effective_to` IS NULL OR `effective_to` > '2025-12' THEN '2025' ELSE substr(`effective_to`, 1, 4) END
	FROM `recurring_version`
	WHERE `cadence` = 'Yearly' AND `effective_from` <= '2025-12'
	UNION ALL
	SELECT `recurring_id`, CAST(CAST(`period` AS integer) + 1 AS text), `last`
	FROM `years`
	WHERE `period` < `last`
)
INSERT INTO `recurring_payment` (`id`, `recurring_id`, `period`, `paid_at`)
SELECT lower(hex(randomblob(16))), `recurring_id`, `period`,
	CAST(strftime('%s', `period` || '-12-31 12:00:00') AS integer)
FROM `years`
WHERE true
ON CONFLICT (`recurring_id`, `period`) DO NOTHING;
