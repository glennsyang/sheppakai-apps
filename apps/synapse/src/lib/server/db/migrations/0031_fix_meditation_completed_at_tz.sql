-- #51: meditation completed_at was parsed from a zone-less datetime-local value in the server's
-- UTC process timezone, so each stored instant holds the entered Pacific wall-clock time as UTC.
-- Shift every row forward by the Pacific offset for that wall-clock moment
-- (US DST: 2nd Sunday of March 02:00 -> 1st Sunday of November 02:00).
UPDATE `meditation_sessions`
SET `completed_at` = `completed_at` + CASE
	WHEN datetime(`completed_at`, 'unixepoch') >= datetime(strftime('%Y', `completed_at`, 'unixepoch') || '-03-01', 'weekday 0', '+7 days', '+2 hours')
	 AND datetime(`completed_at`, 'unixepoch') < datetime(strftime('%Y', `completed_at`, 'unixepoch') || '-11-01', 'weekday 0', '+2 hours')
	THEN 25200
	ELSE 28800
END;
