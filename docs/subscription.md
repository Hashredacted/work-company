# Subscription

## Lifecycle

TRIAL
 ↓
ACTIVE
 ↓
EXPIRED

Possible additional states:
SUSPENDED
CANCELLED
PAST_DUE

Do not implement extra states until required.

## Trial

Duration: 7 days.

Store:
- `trial_started_at`
- `trial_ends_at`

## Subscription

Store:
- plan
- status
- start date
- end date
- renewal date

## Rules

Subscription logic must be separate from billing/payment logic.

Do not assume payment gateway until specified.