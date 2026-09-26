# Tokiroom — Product Spec

What the app is and the product decisions behind it. Rooms, friends, and
ambient presence have their own design notes in
`docs/design/rooms-and-ambient.md`.

## What this app is

A focus-session tracker, originally built for someone with ADHD. Core loop:
set a timer, work, rate how the session went, and build a visual history of
effort over time. Nothing is mandatory except the timer duration; everything
optional is gently encouraged.

## Stack

- Next.js (App Router), all pages client-rendered
- Supabase: anonymous auth, Postgres with RLS, Realtime
- Deploy target: Vercel

## Accounts

- On first visit the app calls `supabase.auth.signInAnonymously()`. This
  creates a real, permanent user id; all data is saved against it from the
  first action. There is no separate guest store to migrate.
- Attaching an email later uses `supabase.auth.updateUser()` on the same user
  id, so no data migration is needed.
- If an anonymous user clears browser storage or switches devices without
  attaching an email, their data is unrecoverable. The account nudge and
  Settings say so.

## Data model

- **goals**: name, status (active / completed / abandoned), color, optional
  weekday schedule, last-used duration, optional `link_group_id` (shared goals).
- **sessions**: optional goal, optional name, planned and actual duration,
  started/ended timestamps, rating, notes, end reason, status (in_progress /
  completed), elapsed seconds (for saved-for-later), optional room.
- **session_tasks**: per-session tasks with check-off time, duration, and an
  optional 0–5 rating.
- **session_templates**: reusable session recipes (quick starts), optionally
  scheduled to weekdays.
- **period_notes**: freeform notes per day, week, or month (heatmap tap target).
- Social tables (profiles, friends, rooms, goal sharing) are described in the
  design notes.

A session belongs to at most one goal. This is intentional: a small forcing
function toward single-tasking rather than one session sprawling across
several things.

## Screens

1. **Home**: session setup (name, goal, tasks, duration), plus Sessions in
   progress, Continue a goal, Unfinished tasks, Today's plan, and Quick starts.
2. **Timer**: "Today, you're working on", a large countdown, Pause, I'm done,
   +15 min, Save & continue later, and a task list with per-task durations.
3. **Rate**: "You showed up." with the duration banked, an optional mood
   rating, notes, session name, goal assignment if none was picked, per-task
   ratings, and an option to save the session as a quick start.
4. **Goal detail**: total time, supporting stats, schedule, share link, and
   session history.
5. **Session detail and edit**: the rating screen UI, pre-filled, editable at
   any time.
6. **Search**: across session names and notes, with highlighted snippets.
7. **All goals**: every goal with totals; rename, recolor, delete, filter by
   status.
8. **History**: sessions grouped by relative day.
9. **Profile**: lifetime stats, a time/rating trend chart, and a consistency
   heatmap with day/week/month notes.
10. **Settings**: account, scheduled goals, the account-nudge toggle, delete
    account.

## Product decisions

- **Default duration is 3 minutes** for a fresh setup. Intentionally
  low-intimidation. Opening a specific goal uses that goal's last-used
  duration instead (per-goal memory, not a global value).
- **Timer end does not nag.** When the timer runs out, the app waits silently.
  If Done is clicked after the planned time, the Rate screen asks what
  happened first. The logged duration stays the planned duration unless the
  user says they were still deep in focus and enters how long.
- **Ratings are mood words, not grades.** The session slider shows only a word
  (scattered, choppy, steady, focused, flowing). Aggregates (goal averages,
  session detail) show numbers such as 4.3/5; the user explicitly preferred
  numbers for aggregates.
- **Deferred labeling.** If the user didn't name a goal or session up front,
  the Rate screen asks afterwards. People know what they were doing better in
  hindsight than in advance.
- **The minimal path is genuinely minimal.** Start on the default timer, tap
  Done, save. A correctly structured session is logged.
- **Account nudge schedule** is fixed and non-escalating: after the 1st saved
  session, then every 5th. Framed as protecting data, never unlocking
  features. It can be turned off in Settings.
- **Today's plan** lists goals and quick starts scheduled for today's weekday.
  It never nags if ignored.

## Visual design

- **Fonts**: Outfit for all UI text; Quicksand (500–600) only for numbers
  (timer, stats, durations).
- **Themes**: Paper (default: warm linen background, ink-indigo text and
  accent), Ink (dark), and Cherry blossom. Colors are CSS tokens in
  `src/app/globals.css`; token names like `coral` and `cream` are legacy and
  no longer describe the colors.
- **Layout**: no drop-shadowed SaaS cards as the default container;
  hierarchy through size and space. Pill buttons: filled for primary actions,
  outlined for secondary.
- **Sliders** (duration and rating) use a custom thin vertical-line thumb over
  tick marks, never the native dot.
- **Large editable numbers** render as plain text; clicking reveals an input.
  Native inputs clip large font sizes.
- **Icons** only for real affordances (back, settings, search, calendar), not
  as label decoration.
- **Copy**: direct and plain ("You showed up.", not "Great job!"). No em dashes
  in user-facing text.

## Rejected

- Multiple goals per session.
- Repeated notifications when a timer ends without Done being clicked.
- Native slider thumbs.
- A bar chart for score over time (a line chart with clickable points instead).
- A padded calendar-grid heatmap (a dense contribution-style grid instead).
- Distraction tags and goal-less categories: built into the schema early but
  never surfaced in the app; removed.
