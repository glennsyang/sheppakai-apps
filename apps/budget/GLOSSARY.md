# Budget

Household money tracking: what comes in, what goes out, what's planned for each category, what
recurs, and what's being saved. It also keeps the books for a side window-cleaning business.

## Language

### People

**Household**: The people who share one set of financial records. All data belongs to the household,
not to one person.

_Avoid_: Family, account, team

### Money in and out

**Expense**: Money the household spent: a payee, an amount, a date and a category.

_Avoid_: Transaction, purchase, spending

**Income**: Money the household received.

_Avoid_: Earnings, deposit, revenue

**Category**: A named group of expenses, such as Groceries or Gas.

_Avoid_: Tag, type, bucket

**GST**: The sales tax recorded on an expense, when there is one.

_Avoid_: Tax, HST, VAT

### Budgeting

**Budget**: The amount planned for one category in one month.

_Avoid_: Limit, allowance, envelope

**Preset**: How a budget's amount was chosen: last month's spending, last month's budget, the
monthly average over the 12 months before, or a custom amount.

_Avoid_: Template, default

**Monthly Average**: Spending over the full months in a window, divided by the number of those
months. The window starts at the first month with spending if that is later, and empty months after
it count as zero. The current month, later months and excluded expenses never count.

_Avoid_: Mean, typical spend, trailing average

**Excluded**: An expense that does not count against its category's budget.

_Avoid_: Ignored, hidden, off-budget

**Over Budget**: A category whose expenses for the month, not counting excluded ones, are more than
its budget.

_Avoid_: Overspent, in the red

**Spending Spike**: A category spending well above its monthly average over the months before.

_Avoid_: Anomaly, outlier, unusual spending

### Recurring Bills

**Recurring Bill**: A charge from a merchant that comes back every month or every year, with a due
date. It can be ended.

_Avoid_: Bill (on its own), subscription, recurring

**Bill Payment**: One period of a recurring bill marked as paid.

_Avoid_: Paid flag, payment record

**Bill Price**: The amount and cadence a recurring bill has from a given date. A price change starts
a new bill price.

_Avoid_: Version, rate

**Overdue Bill**: A recurring bill with no bill payment for a period whose due date has passed.

_Avoid_: Overdue (on its own), late bill

### Savings

**Savings Account**: A balance held somewhere, such as a TFSA, updated over time.

_Avoid_: Savings (on its own), pot, fund

**Savings Goal**: An amount the household is working toward, with an optional target date. Its
progress is the sum of its contributions. It is not tied to a savings account.

_Avoid_: Target, objective

**Contribution**: Money put toward a savings goal on a date.

_Avoid_: Deposit, transfer

**Goal Status**: Where a savings goal stands: **Active** (being saved toward), **Paused** (on hold,
still visible), **Completed** (target reached) or **Archived** (put away for any reason and hidden
from everyday views; an admin can restore it).

_Avoid_: State, stage

### Receipts

**Fuel Receipt**: An expense in the Gas category.

_Avoid_: Gas receipt, fuel transaction

**Business Receipt**: Any expense outside the Gas category that has GST recorded.

_Avoid_: Work receipt, tax receipt

**Receipt Scan**: Reading a photo of a receipt to pre-fill a new expense. Nothing is saved until
someone confirms it, and the photo is not kept.

_Avoid_: Upload, OCR

### Window Cleaning

**Customer**: Someone whose windows the business cleans, at one address.

_Avoid_: Client

**Job**: One cleaning visit to a customer: a date, the amount charged, an optional tip and the hours
worked.

_Avoid_: Visit, appointment, booking

**Revenue**: The money a job brought in: the amount charged plus any tip. It is business money, not
income, unless someone also records it as income.

_Avoid_: Income, earnings

**Reclean Interval**: How many days after a job a customer should be cleaned again.

_Avoid_: Frequency, schedule

**Overdue Customer**: A customer whose reclean interval has passed since their last job.

_Avoid_: Overdue (on its own), due customer

**Invoice**: The bill sent to a customer for one job.

_Avoid_: Bill, receipt

**Deleted Customer**: A customer removed from the everyday list but kept on record. An admin can
restore them.

_Avoid_: Archived customer, inactive customer
