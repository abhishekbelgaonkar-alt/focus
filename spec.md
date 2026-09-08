Focus Session Tracker — Full Product Specification
What this app is

A personal focus-session tracking app for someone with ADHD. Core loop: set a timer, work, rate how the session went, optionally tag distractions and goals, and build a visual history of effort over time. Built to have zero mandatory friction — nothing is ever required, everything optional is gently encouraged.

Tech stack
Next.js (App Router)
Supabase — auth (including anonymous auth upgraded to real accounts) and Postgres database
Deploy target: Vercel
Core data model

users — via Supabase Auth. Starts anonymous (supabase.auth.signInAnonymously()), can later be upgraded to a real account via supabase.auth.updateUser() (attaching email/password), which preserves the same user ID and therefore all existing data.

goals

id
user_id
name (text)
created_at
status (active / completed / abandoned — optional, can default to active)
schedule (optional — array of weekdays it recurs on, e.g. ['mon','wed','fri'], or null if not scheduled)

categories

id
user_id
name (text) — used for goal-less sessions

sessions

id
user_id
goal_id (nullable — exactly one goal OR one category, never both, never neither)
category_id (nullable)
session_name (optional text — e.g. "Fix login bug")
planned_duration_minutes
actual_duration_minutes (defaults to planned; can be overridden — see logic below)
started_at (timestamp)
ended_at (timestamp — when "Done" was actually clicked, may be later than planned end)
rating (float, 1.0–5.0, 0.5 increments)
notes (text, freeform)
end_reason (enum: on_time, still_focused, distracted, forgot_to_end, other — only relevant when Done was clicked after the timer already ended)

distraction_tags

id
user_id
name (text) — grows over time as user adds custom tags; seeded with defaults (see below)

session_distraction_tags (join table)

session_id
tag_id

day_notes / week_notes / month_notes (or a single period_notes table with a period_type enum + period_start_date)

id
user_id
period_type (day / week / month)
period_date (the date representing that day, or the start date of that week/month)
note (text)
One critical rule: one goal (or category) per session

A session can be linked to exactly one goal, OR exactly one category (for goal-less sessions), never both, never neither, and never multiple. This is intentional — it's a small forcing function that encourages single-tasking rather than letting one session sprawl across multiple things.

Default distraction tags (seed data)

Phone, Social media, Noise, Hunger, Tiredness, Intrusive thoughts, Other people, Procrastination, Physical discomfort, Task felt too hard, Unclear what to do next.

Users can add custom tags at any time; the list is per-user and grows.

Screen-by-screen flows
1. First-time user — timer setup screen
Text field labeled "What are you focusing on" with sub-label "Optional — you can skip this and add it after"
Placeholder text: "e.g. Finish thermodynamics ch. 1"
Below that: a duration display and picker
Default duration for a first-time user: 3 minutes (intentionally low-intimidation)
The number is shown as a large, clickable <span> (NOT a native number input — native inputs clip large font sizes due to internal box constraints). Clicking it focuses a hidden, visually-invisible <input type="number"> positioned behind/near it, so the person can type a number directly.
Below the number: a custom-styled range slider (1–90 minutes) with:
Native slider thumb and track fully hidden (-webkit-appearance: none, -moz-appearance: none, plus explicit border: none and box-shadow: none overrides — necessary because default browser styling can leak through inconsistently)
Custom thumb: a thin vertical coral line (~4px wide, ~26px tall), NOT a circular dot
Tick marks above the track, three tiers:
Tiny tick every 1 minute
Medium tick every 5 minutes
Tall tick + number label every 15 minutes (0, 15, 30, 45, 60, 75, 90)
Slider and number stay in sync both directions (dragging updates the number, typing updates the slider)
"Start focus session" button (always enabled regardless of whether the goal field is filled)
1b. Returning user — timer setup screen
Same layout, but:
If today matches a scheduled goal's recurring day, show a "Today's plan" callout ABOVE everything else (see Home Screen section below) — this takes precedence
If opening a specific goal to start a session on it, the duration defaults to the last duration used for that specific goal (not 3 minutes, not a global last-used value — per-goal memory)
2. Home screen (returning users, no specific goal pre-selected)

Top to bottom:

Date header
If any goals are scheduled for today: a soft highlighted card (light coral/peach background, 
#fbe6d4) labeled "Today's plan" listing every goal scheduled for today, each tappable to jump straight into starting a session for it. This message appears once per app-open, calmly, never repeated or nagging if ignored. If nothing is scheduled today, this section doesn't render at all — no empty state.
"Or pick up where you left off" — the most recent goal shown with a filled coral "Continue" button, plus 1-2 other recently active goals with outlined "Continue" buttons. Each shows accumulated stats (e.g. "4h 12m across 11 sessions").
A dashed-outline "Start something new" button at the bottom — always available, never buried.
3. Timer running screen
Shows the goal/task name at top ("Today, you're working on")
Large countdown timer display
Pause and "I'm done" buttons
4. Timer ends, "Done" not yet clicked

The app does NOT repeatedly nag with notifications. It waits silently. Whenever the user does return and click Done, if time has elapsed past the planned duration, show a branch question FIRST, before the rating screen:

"Your timer ended a while ago. What happened?"

I was still deep in focus — didn't notice
I got distracted and lost track of time
I finished early and forgot to end it
Something else

Duration logic:

Default: logged duration = the original planned timer duration, regardless of exactly when Done was clicked.
Exception: if the user selects "I was still deep in focus — didn't notice," ask one follow-up: "How long do you think you actually focused for?" and use their answer as the logged duration instead.
All other branch answers keep the original planned duration as the log.

After the branch question (or immediately, if Done was clicked before the timer ran out), go to the Rating screen.

5. Rating screen
Shows goal/task name at top
Rating: 5-point scale with 0.5 increments (1.0–5.0), controlled via the same custom ruler-style slider as the duration picker (thin coral line thumb, tick marks, NOT a native dot)
A word label above the numeric rating, tied to the nearest whole number:
1 = Rough
2 = Distracted
3 = Okay
4 = Focused
5 = Locked in
(half-points share the nearest whole-number word, e.g. both 4.0 and 4.5 show "Focused")
Below the slider: "What pulled your focus" — structured distraction tags as tappable pills (selected = filled coral background, unselected = outlined), plus a "+ add" pill to create a new custom tag
Notes field:
Static label above it: "Notes — write whatever you want" (explicitly signals the field is NOT limited to answering the placeholder question)
The placeholder text INSIDE the textarea changes dynamically based on the current rating, to give a concrete example without being prescriptive:
1–1.5 (Rough): "What made it hard to focus at all"
2–2.5 (Distracted): "What kept pulling your attention away"
3–3.5 (Okay): "What would have made this session better"
4–4.5 (Focused): "What made this focused"
5 (Locked in): "What made this session click"
Optional session name field ("Give this session a name") — e.g. "Fix login bug"
If the user started with no goal/category selected at all (skipped it entirely at setup), this screen ALSO asks "What was this session for?" here, with the same optional/skippable framing, offering a dropdown of existing goals/categories (to prevent accidental duplicates) plus a "create new" option.
"Save session" button
6. Goal detail / history view
Back navigation
Goal name as page title
Three stats side by side: total time, session count, average rating (numeric, e.g. "4.3/5" — NOT a word)
"Session history" (or "Sessions" when reached via All Goals) list below — each row shows session name (or falls back to "Session" if unnamed), date/time, duration, and rating
Tapping a row opens Session Detail
7. Session detail view
Back navigation, "Edit" link top right
Goal/task name, date/time, duration
Rating shown as number + word (e.g. "4.0/5 Focused")
Distraction tags shown as pills (read-only in view mode)
Notes shown as plain text
Clicking "Edit" drops into the same Rating-screen UI, pre-filled with existing values, editable and re-saveable at any time (no restriction on editing old sessions)
8. Search
Search bar (magnifying glass icon inline)
Searches across session notes and session names
Results show: goal name, rating, date, and a trimmed text excerpt with the matched term highlighted inline (like a search engine snippet)
Tapping a result opens that session's detail view
9. All goals overview
Simple list of every goal (not just recent ones): name, total time, session count, average rating, chevron to expand into that goal's detail view
10. Account-save nudge
Appears as a small inline card (not a blocking modal), triggered after the 1st session, then after every 5th session thereafter (check: session_count === 1 || session_count % 5 === 0)
Copy: leads with actual accumulated data (e.g. "You've logged 4h 12m across 11 sessions"), then explains why: "Create an account so you don't lose this if you switch devices or clear your browser."
Two actions: filled "Create account" button, plain-text "Not now" dismiss, plus an X icon
Framing is protective, never a feature-unlock upsell — nothing in the app is ever gated behind an account
11. Profile page

Top to bottom:

Header: "Profile" title + settings gear icon (links to Settings page)
Account row: email + "Sign out" link
Lifetime stats: total hours all-time, total session count, current day streak
Line chart: Day/Week/Month toggle above it.
X-axis: time (dates)
Y-axis: rating score (1–5, labeled on the left)
Each point = one session (in Day view). In Week/Month view, points should aggregate to one point per day or per week respectively (averaged), NOT one point per individual session, to avoid an unreadably dense chart at zoomed-out scales.
Points are clickable — clicking one shows that session's goal name, session name (if any), date/time, and score in a card below the chart, and would navigate to that session's detail page in the real app
Heatmap ("Consistency"): separate Day/Week/Month toggle (independent from the line chart's toggle — they answer different questions and don't need to sync)
Day view: a GitHub-style contribution grid — small tight squares, NOT full calendar cells with lots of padding
Layout: weekday labels (Mon–Sun, all seven, not alternating) down the left side; month name with prev/next chevron arrows displayed directly ABOVE the grid (not in a page header corner); date numbers displayed inside each colored square
Color scale: blank/pale = no session that day; increasing coral saturation = higher average rating that day (5-tier scale from pale to deep coral, labeled "Rough" to "Locked in" at the bottom as a legend)
The whole grid block should be horizontally centered in the container, not stretched edge-to-edge and not left-aligned with dead space on one side
Tapping any day cell opens an inline note box below the grid, titled with that date, where the user can write a freeform note about that day (e.g. "started my period, focus was rough this week"). Same interaction pattern should extend to week and month views (tapping a week-block or month-block opens a note for that period).
CSV export button at the very bottom: "Export all data as CSV" — full-width, outlined button with a download icon. Exports all sessions, goals, categories, tags, ratings, notes, timestamps.
12. Settings page

Sectioned list, each section with an uppercase small label:

Account: email (display only), "Change password," "Sign out"
Distraction tags: "Manage tags" row showing current count, links to a tag management view (add/rename/delete custom tags)
Scheduling: "Scheduled goals" row showing count of active schedules, links to the Scheduled Goals overview
Notifications: toggle for "Remind me to save my progress" (controls whether the account-save nudge shows at all)
Danger zone (visually distinct, warm red-toned text): "Delete account and all data"
13. Scheduling flow
Entry point: from a goal's detail page, a "Schedule this goal" row with a calendar-plus icon
Day picker: seven circular toggle buttons (M T W T F S S), tap to select/deselect which weekdays this goal recurs on. This is RECURRING/weekly, not one-off specific calendar dates.
"Save schedule" button
Scheduled Goals overview (reached from Settings): list of every goal with an active schedule, showing which days it repeats on, with an X to remove/cancel that schedule
This directly powers the Home Screen's "Today's plan" callout — if today's weekday matches a goal's schedule, it surfaces there automatically
Visual design system
Fonts
Outfit — used for all UI text: labels, body copy, buttons, headings. (Note: earlier iterations tried Karla, then Quicksand for everything, then settled on this specific split.)
Quicksand (weight 500–600) — used ONLY for numbers: the timer countdown, the big rating number, all stat figures (hours, session counts, averages). This creates a soft, rounded visual distinction for data/numbers versus words.
Load both via Google Fonts: Outfit:wght@400;500 and Quicksand:wght@500;600
Color palette
Background: warm off-white / cream — 
#fdf6ee
Primary text: dark warm brown — 
#3d3126
Secondary/muted text: warm tan — 
#b08c6a
Lighter muted text (placeholders, legends): 
#c9b79c
Borders/dividers: soft warm beige — 
#ecdcc9
Accent color: warm coral-orange — 
#d9642e (this was landed on after explicitly rejecting: plain terracotta/rust, deep plum/wine, and deep pine green — the person wanted something that reads as "warm like sunlight," NOT yellow, and NOT any color that felt derivative of Claude's own default design system colors)
Distraction tag pill (selected state): light peach background 
#fbe6d4 with darker coral-brown text 
#a05a1f
Heatmap 5-tier scale (low to high): 
#f0ece2 (none) → 
#f3d9bd → 
#f0b587 → 
#e8905a → 
#d9642e (highest)
Layout principles (explicitly derived from rejecting AI-generated-looking defaults)
No rounded "card" components with drop shadows as the default container style — avoid the generic SaaS-dashboard look
Left-aligned and asymmetric layouts preferred over centered-everything
Buttons: fully rounded/pill-shaped (border-radius: 24px), filled coral for primary actions, outlined (1.5px border, transparent background) for secondary actions
Sliders (BOTH the duration picker and the rating slider) must use the custom thin-vertical-line thumb style, never the native browser dot/circle thumb. This requires explicit CSS resets across -webkit-appearance, -moz-appearance, and explicit border: none / box-shadow: none since native browser slider styling can be inconsistent about which properties it lets you override.
Numbers that need to be large and prominent (timer, ratings) should render as plain text elements (<span>) rather than inside <input> boxes where possible, since native input elements can clip large font sizes due to internal line-box constraints — for editable numbers, pair a visible <span> with a hidden/invisible input behind it that receives focus and keyboard input when the visible number is clicked.
Avoid decorative icons next to every label ("⏱ Timer," "📝 Notes") — use icons only for genuine interactive affordances (edit, back navigation, settings gear, search, chevrons for expand/collapse), not as label decoration.
Behavioral/UX principles that must be followed throughout
Nothing is ever mandatory except the timer duration itself. Goal name, category, notes, distraction tags, session name — all optional, always skippable, always presented with visible affordance to skip (either explicit "optional" sub-labels or a clearly reachable alternative action).
No nagging, ever. The account-save nudge follows a strict, non-escalating schedule (session 1, then every 5th) and is never shown more frequently regardless of dismissal. The "Today's plan" schedule message shows once per app-open and is never repeated if the user picks a different goal instead.
Deferred labeling over upfront demands. If a user doesn't know what to call something yet (a goal, a session), the app asks AFTER the relevant action is complete (after the session ends), not before, since people know retroactively what they were actually doing better than they can predict it in advance.
Minimal path exists and is genuinely minimal. A user should be able to: (1) tap start on a default timer, (2) tap Done, (3) pick a rating, (4) optionally type one goal name — four actions total — and have a fully functional, correctly-structured session logged.
Account architecture

Use Supabase's anonymous auth:

On first visit, call supabase.auth.signInAnonymously(). This creates a real, permanent user ID in Supabase's auth system, persisted client-side via Supabase's client library (localStorage-backed).
All data (sessions, goals, tags) is saved against this user ID from the very first action — no separate "guest mode" data store to migrate later.
When the user chooses to create a real account, call supabase.auth.updateUser() to attach email/password (or OAuth) to the SAME underlying user ID. No data migration script needed — it's the same row, just upgraded from anonymous to identified.
Known limitation to eventually surface in copy somewhere (e.g. the nudge): if a user stays anonymous and clears browser storage or switches devices without upgrading, that data is permanently unrecoverable, since there's no credential to log back in with.
Explicitly rejected approaches (context for why certain choices were made)
Rejected word-based average rating display (e.g. "Good") in favor of numeric (e.g. "4.3/5") — the person explicitly prefers numbers over words for aggregate scores.
Rejected a bar chart for the score-over-time visualization in favor of a line graph with clickable points.
Rejected multiple goals per session — deliberately restricts to one goal (or one category) per session as a forcing function against split attention.
Rejected repeatedly-nagging notifications when a timer ends without the user clicking Done — the app waits silently rather than repeatedly alerting.
Rejected native slider thumbs (circular dots) throughout — replaced everywhere with a custom thin vertical line matching the accent color.
Rejected a full traditional calendar-grid heatmap (with lots of whitespace/padding per cell) in favor of the tighter, GitHub-contribution-style dense grid, while still retaining weekday and month labeling for orientation.
Rejected several earlier color directions before landing on coral: plain rust/terracotta, deep plum/wine, and deep pine green were all explicitly tried and rejected as either "too close to Claude's own colors" or "too cold."