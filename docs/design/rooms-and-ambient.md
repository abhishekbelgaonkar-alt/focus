# Rooms, Ambient Presence, and Social Focus — Design Notes

Internal design doc. Captures where the thinking has landed on rooms,
ambient presence, and the social side of Tokiroom, plus the reasoning
behind each choice so future me (or anyone else) can pick up the thread
without re-deriving it.

Not for the website. Not marketing copy. Just record.

---

## 1. What a room is

A room is a **place**, not a proximity signal. That distinction turns out
to be the whole design.

- A room has an identity while it exists: a name, a code, walls.
- It begins when someone creates it.
- It persists until the last person leaves.
- What happens inside it is a shared event, not two parallel activities.

That's what makes a room feel different from "we happen to be studying at
the same time." The commitment of joining, the shared beginning, the
knowledge that the room outlasts individual comings and goings — those
are what give shared focus its weight.

Rooms shouldn't try to be the answer to "I want my friends around while I
focus." That's ambient presence. Rooms are the answer to "I want to focus
in a shared space *as an event*."

## 2. What we shipped in the rooms feature

Current state, as of commit `b00ec5d`:

- **Create room**: from home page, "Focus with someone" button. Creates
  a room row with a short_code. Host is inserted as first participant.
- **Join room**: `/r/[shortCode]` page. Guests land on an invitation
  card, tap Join.
- **Per-participant setup**: each person has their own task list
  (public, real-time) and their own goal (private). When the host opts
  to share their setup, joiners' lists seed from the host's. Otherwise
  joiners start empty and load their own.
- **Load setup from anywhere**: inside a room you can pull in a
  quick-start template, a scheduled-for-today goal, or continue an
  in-progress session. Every home-page entry point is reachable.
- **Copy task from another participant**: `+ copy` next to each of
  their tasks. One tap adds it to your list.
- **Private check-offs**: task list is public, but which ones you've
  checked is not shared.
- **Personal timers**: each participant's clock starts at their own
  joined_at, not the room's start.
- **Stay-with sync**: one-way — you can sync your target end time to
  someone with more time remaining. Preserves the "no forcing anyone to
  end early" identity.
- **Stay-prompt**: at the end of your target when others are still
  going, a soft prompt asks if you want to keep going.
- **Handle editing inline**: change your handle from within a room, no
  settings trip required.
- **Room persists until last leaves**: leaving marks your participant
  row; room ends only when nobody's left.
- **Rejoin preserves state**: coming back keeps your task list, doesn't
  reset it.
- **Copy link from footer**: any participant can copy the room's URL to
  invite more people.

## 3. What's not built yet

- **Room recap on end.** When a room closes, everyone who was in it gets
  a shared, commemorative recap: who was in it, how long we focused
  together, what the session name was. Not competitive. Just record.
- **Shared history on friend profiles.** "You and Alice have focused
  together in 12 rooms." A soft accumulation, no stats.
- **Scheduled rooms.** Create a room for later. See it in Today's plan.
  Details below.
- **Room invitations.** Direct invite to a friend, discoverable on their
  home page. Details below.
- **In-room toggle for propagate_setup.** RPC exists
  (`update_room_propagate`) but no UI. Host can currently only choose at
  creation.
- **Atmospheric redesign of the room page.** The page still looks like a
  stack of sections with labels above each one. Rooms should feel like
  places — timer breathing at the top, task list flowing without
  boxed borders, ambient presence at the bottom. Deferred; the mechanics
  needed to land first.

## 4. Ambient presence — the proposed feature

The gap: today, if two friends are both focusing at the same time,
neither knows. Solo sessions are invisible. Rooms require someone to
create and share a link. There's no "my people are around" signal.

Ambient presence fills that. Design principles for it:

- **Peek, don't invade.** You can see friends are focusing and glance at
  what they're doing. You can't stream their check-offs or take actions
  in their session.
- **Lean, so it doesn't cannibalize rooms.** No sync, no shared tasks,
  no "study together" upgrade path inside ambient. Those things are what
  rooms are for. If ambient does them too, rooms lose their identity.
- **Visibility is opt-in per session.** Default: visible to friends. One
  tap to go invisible for this session. Preference persists.

### What it would show

On the home page and inside a session:
- Small indicator: "3 friends focusing." Tap to expand.
- Expanded: each friend's handle, how long they've been in, their
  session name / goal if set, their public task list.
- Two labels distinguish rooms from solo: "OliveHare17 · solo, 30m in"
  vs "Sam · in a room with 2 others."

### What you can do from ambient

- **Look**, then go back to your own session. This is the point 90% of
  the time.
- **Invite to a room**: one-tap "come focus with me" — if you're already
  in a room, sends the link. If you're solo, promotes you to a room and
  invites them.
- Nothing else.

### Why NOT sync-clocks or task-sharing from ambient

Considered them. Walked them back. If you can achieve the goodness of
rooms (mutual sync, shared task lists) without ever entering a room,
rooms become "the ceremonial version of what you already have." That
would weaken the whole rooms concept. Ambient stays observational.

### Presence data model (sketch)

- New table `active_sessions`: user_id, started_at, session_type
  (`solo` | `room`), room_id nullable, session_id nullable, visibility
  (`private` | `friends`), planned_duration_minutes, current_goal_id
  nullable, current_goal_label nullable, tasks jsonb.
- Row created on session start. Deleted on end.
- Friends query: any row where user_id is in your friendships and
  visibility ≥ friends.
- Realtime subscription filtered to friend IDs.

## 5. Why rooms and solo sessions are still separate

They should probably be unified eventually (a solo session is a "room of
one"), but not yet.

Current split:
- Solo → `/timer` page, sessionStorage, no server-side presence, full
  immersive countdown, has pause + save-for-later.
- Room → `/r/[code]` page, `rooms` + `room_participants` rows, Realtime
  channel, participant list, sync.

The reasons the split exists:
- Solo was built first.
- Solo is offline-capable; rooms need Realtime.
- Solo has an immersive "big empty countdown" quality that would be hard
  to preserve if it becomes a rooms page with one participant.

Why not unify now:
- Big migration cost. Every session needs a room. Historical data needs
  backfill or a nullable column.
- Offline story regresses.
- Risk of ruining solo's zen by adding room-like scaffolding.
- Better to fix the disease (no presence, no cross-user awareness) than
  the symptom (two code paths). Adding ambient presence as an additive
  layer solves the disease without unifying anything.

Revisit unification only if the duplication starts causing real pain
(bugs diverging, features slow to add). Until then, keep them separate.

## 6. Rooms vs ambient — the distinction

They serve different needs and should both exist.

**Ambient** — awareness. "My people are around." Zero friction, zero
commitment, evaporates when the session ends. No shared trace.

**Room** — event. "We did this together." Requires a moment of choice,
creates a shared thing that persists. Leaves a trace in history.

Rooms lean **into** what makes them rooms:
- The shared start (all join, all can see when).
- The shared identity (session name, code).
- The shared end (recap when the room closes).
- The shared record (appears in both friends' history).

Ambient leans into what makes it ambient:
- No shared start. Everyone's in their own session.
- No shared identity.
- No shared end. When a friend leaves, they were just visible before —
  no room to close.
- No shared record. It never happened as a joint thing.

For everyday focus between friends, ambient will be the default. Rooms
are for when you want to make it an event.

## 7. Room recap and shared history

When a room ends, generate a small shared-recap experience:
- Who was in it
- How long we focused together (total room duration or shared overlap
  minutes)
- The session name (if any)
- Optionally: what everyone's tasks were, high level

This shows up:
- On the Rate page immediately after (extends the current room-context
  header).
- On each participant's history for that day.
- On friend profiles: "You and Alice have focused in 12 rooms" — soft
  count, no stats. Tap to see the list.

Not competitive. No leaderboard. Just record.

## 8. Scheduled rooms

The goal: schedule a room ahead of time, invite friends, see it in
Today's plan when the day comes.

### The design

- **At room creation**: option to "schedule for later" — set a time,
  optionally a day. Room is created as dormant.
- **Invitees see it in Today's plan** the day of. No push, no separate
  inbox tab.
- **At the scheduled time (~5 min before)**, the room "opens" — Join
  button becomes active. Entry moves to top of Today's plan.
- **Auto-close 30 min after scheduled time** if nobody joins.
- **No formal accept flow.** Optional soft "I'll be there" tap. Silence
  is decline. No penalty for not showing up.

### Why no formal accept

- Feels like a calendar app.
- Wrong identity for Tokiroom.
- Host doesn't functionally need it — the room opens whether you know
  who's coming or not.
- Users don't need it — the plan is soft.

### But we still need discovery

The user's real concern was: if someone doesn't check the schedule tab,
they'll miss the invitation. That's a notify problem, separate from
accept. Solved by:

1. **Home-page surface.** Invitations appear in Today's plan (or a
   Coming up section for later dates) above the fold. You land on the
   page and see them.
2. **Small dot on the Friends button** when there are unread invites.
   Passive. Clears after you've opened it once.
3. **Real-time banner** for right-now invites: "Alice just started
   focusing — come drop in." Persistent until join, dismiss, or the
   room ends.

### Room-invite data model (sketch)

- Add `scheduled_for timestamptz` column to `rooms`. Room is dormant
  until then.
- New table `room_invites`: room_id, invitee_user_id, created_at,
  seen_at nullable, rsvp (`yes` | null).
- Home page fetches inbound invites on load.
- Realtime subscription on `room_invites` for the right-now case.

## 9. In-app notification stance

Do NOT add:
- OS push notifications (wrong identity).
- Modal invitations that block the app.
- Aggressive email nudges.
- Streak-preserving anti-abandonment prompts.

DO add:
- Passive home-page surfaces.
- Small badge dots on nav elements.
- In-app real-time banners for imminent events.

Discovery without demand.

## 10. Build order

Chosen sequence, in priority:

1. **Ambient presence** (see friends, peek, invite-to-room). Fills the
   biggest gap in daily use.
2. **Room recap on end** (commemorative). Small addition, big
   emotional payoff.
3. **Shared history on friend profiles**. Falls out of #2.
4. **Scheduled rooms with discovery**. Wait until #1-3 land so we know
   what's actually missing before adding more surface.
5. **Atmospheric room-page redesign**. Once features stabilize, pass on
   the layout to make rooms feel like a place.
6. **In-room propagate toggle** (host can flip after creation). Small
   UI addition on top of the existing RPC.

Deferred / maybe never:
- Solo + room unification. Only if duplication becomes painful.
- Named recurring rooms. Feels too formal, edges toward leaderboard.
- Push notifications, of any kind, for anything.

## 11. Identity constraints that shape everything above

Things that keep being the deciding factor and should stay locked:

- **No nagging.** No push, no streak shame, no "you haven't focused in
  X days." Presence and record accumulate quietly.
- **Time-first framing.** Everything measures duration, not counts or
  ratings. Even the shared recap is minutes, not "sessions completed."
- **Anonymous-first.** No real names. Handles stay opaque unless the
  user wants otherwise.
- **Warm quiet aesthetic.** No competitive UI, no urgent colors, no
  progress bars where they'd add pressure.
- **Show up. Do the work. Leave.** The identity keeps coming back to
  this. Every social feature should feel like it fits inside that
  sentence.

Every design decision above is downstream of these constraints. If a
future feature seems to require breaking one of them, revisit whether
the feature actually belongs.

---

*Last updated during design conversation, 2026-09-26.*
