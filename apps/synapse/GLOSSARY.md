# Synapse

Personal life management: daily agenda, tasks, journal, mood, fitness, meditation and shepherding
visits. Everything in it belongs to one person; nothing is shared.

## Language

### Daily Agenda

**Daily Agenda**: One day's checklist.

_Avoid_: Schedule, plan, to-do list

**Agenda Item**: One thing on a daily agenda, ticked off when done.

_Avoid_: Entry, agenda task

**Standing Item**: A rule that puts the same agenda item on chosen weekdays between a start date and
an optional end date.

_Avoid_: Template, routine, recurring item

### Tasks

**Task**: A piece of one-off work with a state and a priority. It never appears on the daily agenda.

_Avoid_: Todo, ticket, item

**Task State**: Where a task stands: **New**, **In Progress**, **On Hold**, **Blocked** or **Done**.

_Avoid_: Status

**Priority**: How urgent a task is, from 1 (highest) to 4 (lowest).

_Avoid_: Importance, severity

**Task Number**: A task's short ID, such as #42.

_Avoid_: Task ID, ticket number

### Food

**Food Log**: Everything you ate on one day.

_Avoid_: Meal log, diary

**Food Entry**: One eating occasion in a food log: Breakfast, Lunch, Dinner or Snack, with a
description and an optional calorie estimate.

_Avoid_: Meal

### Shepherding

**Group**: The people the group overseer is responsible for visiting.

_Avoid_: Congregation, list

**Group Member**: One person in the group.

_Avoid_: Person, contact

**Group Overseer**: The person who visits the group's members. In Synapse, that's you.

_Avoid_: Elder, shepherd, owner

**Shepherding Visit**: A visit to a group member at their home, on a date, with notes. "Visit" alone
is fine inside Synapse.

_Avoid_: Call, appointment

**Companion**: Someone who came along on a shepherding visit.

_Avoid_: Partner

**Next Visit**: The date you've set for a group member's next shepherding visit.

_Avoid_: Follow-up, scheduled visit date

**Visit Status**: How a group member stands on visits: **Recent** (visited within the first
threshold), **Overdue** (past it), **Critical** (past the second threshold), **Never Visited** (no
visit yet and no next visit set), **Scheduled** (a next visit is set for today or later, which
overrides every other status) or **Exempt**. If a next visit's date passes with no visit logged, the
status goes back to what the last real visit gives.

_Avoid_: Health, colour, state

**Exempt**: The visit status of a group member you've decided doesn't need visits, by your own
judgement. They get no visit warnings.

_Avoid_: Excluded, skipped

**Archived Member**: Someone no longer in your group, kept with their visit history.

_Avoid_: Deleted, inactive

**Visit Warning**: The reminder email sent when a group member becomes Overdue or Critical.

_Avoid_: Alert

### Fitness

**Workout**: One session of exercise, of a type: Strength, Cardio, HIIT, Walk, Stretch or Other.

_Avoid_: Training, session

**Exercise**: One movement in a strength workout, with sets, reps and weight.

_Avoid_: Lift, set

**Weigh-in**: One recorded body weight.

_Avoid_: Weight entry

**Goal Weight**: The body weight you're aiming for.

_Avoid_: Target weight

**Calorie Target**: Your daily calorie goal for the food log.

_Avoid_: Calorie limit, budget

**Workout Reminder**: A scheduled nudge to work out.

_Avoid_: Alarm, notification

### Meditation

**Meditation Routine**: A guided meditation: a link, a length and the moods it suits. It is either
**Built-in** or one you added.

_Avoid_: Track, program

**Meditation Schedule**: When you want to be reminded to do a meditation routine: daily, weekly or
on chosen days.

_Avoid_: Reminder, plan

**Meditation Session**: One time you did a meditation routine, with your mood before and after, each
1 to 5.

_Avoid_: Practice, sit

### Journal and Mood

**Journal Entry**: What you wrote on a date, with optional location and weather.

_Avoid_: Post, note, diary

**Mood Entry**: How you felt on a date: one of Sad, Anxious, Overwhelmed, Tired, Calm, Focused,
Content or Happy, or a custom mood you write in, with optional notes.

_Avoid_: Mood log, check-in

### Notifications

**Morning Digest**: The daily morning push notification: today's agenda, tasks due today, tonight's
planned dinner from Meal Planner, recurring bills due this week from Budget, and overdue visits. A
section appears only when it has something in it.

_Avoid_: Summary, daily email

**Notification Job**: One kind of scheduled reminder or digest (Workout Reminder, Visit Warning,
Morning Digest, ...) run by the notifications cron. Each job says who is due and what to send; the
shared runner (`src/lib/server/notification-jobs/`) owns the clock, dedupe, the notification log and
sending through the Notifier (Brevo email + ntfy push).

_Avoid_: Cron task, processor
