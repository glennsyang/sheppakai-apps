-- One Budget per category per month (#380). Keep the most recently updated row; ties go to the
-- highest id. Runs before the unique index in 0029 so that index can be created.
DELETE FROM `budget`
WHERE `id` IN (
	SELECT `id` FROM (
		SELECT `id`, ROW_NUMBER() OVER (
			PARTITION BY `category_id`, `year`, `month`
			ORDER BY `updated_at` DESC, `id` DESC
		) AS `rn`
		FROM `budget`
	)
	WHERE `rn` > 1
);
