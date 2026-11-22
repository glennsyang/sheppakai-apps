-- #303: a group member's Next Visit now lives only on `people.scheduled_visit_date`.
-- Until now a member with visits took it from their latest visit's `follow_up_date` (latest by
-- date, then created_at) and ignored the member field. Copy that value onto the member, including
-- an empty one, so every computed Visit Status stays the same. Members with no visits keep theirs.
UPDATE `people`
SET `scheduled_visit_date` = (
	SELECT `visits`.`follow_up_date`
	FROM `visits`
	WHERE `visits`.`person_id` = `people`.`id`
	ORDER BY `visits`.`date` DESC, `visits`.`created_at` DESC
	LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM `visits` WHERE `visits`.`person_id` = `people`.`id`);
