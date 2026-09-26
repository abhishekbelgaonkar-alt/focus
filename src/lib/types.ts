export type GoalStatus = 'active' | 'completed' | 'abandoned'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type EndReason = 'on_time' | 'still_focused' | 'distracted' | 'forgot_to_end' | 'other'
export type PeriodType = 'day' | 'week' | 'month'

export interface Goal {
  id: string
  user_id: string
  name: string
  status: GoalStatus
  color: string | null
  schedule: Weekday[] | null
  last_used_duration_minutes: number | null
  created_at: string
}

// One row of the get_goal_stats() RPC: a goal plus its completed-session totals.
export interface GoalStat {
  goal_id: string
  name: string
  status: GoalStatus
  color: string | null
  schedule: Weekday[] | null
  created_at: string
  session_count: number
  total_minutes: number
  avg_rating: number | null
  last_session_at: string | null
}

export interface Session {
  id: string
  user_id: string
  goal_id: string | null
  session_name: string | null
  planned_duration_minutes: number
  actual_duration_minutes: number
  started_at: string
  ended_at: string
  rating: number | null
  notes: string | null
  end_reason: EndReason | null
  created_at: string
}

export interface SessionTask {
  id: string
  session_id: string
  name: string
  position: number
  completed_at: string | null
  duration_seconds: number | null
  rating: number | null
  created_at: string
}

export interface SessionTemplate {
  id: string
  user_id: string
  goal_id: string | null
  name: string
  planned_duration_minutes: number
  tasks: Array<{ name: string }>
  schedule: Weekday[] | null
  created_at: string
  last_used_at: string | null
}

export interface UserProfile {
  user_id: string
  handle: string
  created_at: string
}

export interface FriendInvite {
  user_id: string
  short_code: string
  created_at: string
}

export interface FriendRequest {
  id: string
  from_user_id: string
  to_user_id: string
  created_at: string
  from_profile?: UserProfile   // joined for inbound-request display
}

export interface Friendship {
  user_a_id: string
  user_b_id: string
  created_at: string
}

// A friend as seen from the current user's side, for the Friends dropdown.
export interface FriendView {
  user_id: string
  handle: string
}

export interface Room {
  id: string
  short_code: string
  host_user_id: string
  planned_duration_minutes: number
  session_name: string | null
  goal_label: string | null     // host's goal name, shared only when propagate_setup
  tasks: Array<{ name: string }>
  propagate_setup: boolean
  started_at: string
  ended_at: string | null
  created_at: string
}

export interface RoomParticipant {
  room_id: string
  user_id: string
  joined_at: string
  left_at: string | null
  left_reason: 'left' | 'timeout' | null
  last_seen_at: string
  target_end_at: string | null  // set by "stay with"
  session_id: string | null
  tasks: Array<{ name: string }>
}

// A participant's goal for the room. Private: only its owner can read it.
export interface RoomParticipantGoal {
  room_id: string
  user_id: string
  goal_id: string | null
  goal_label: string | null
}

// Enriched participant for the room UI: joins handle from user_profiles.
export interface RoomParticipantView {
  user_id: string
  handle: string
  joined_at: string
  left_at: string | null
  is_you: boolean
  tasks: Array<{ name: string }>
  target_end_at: string | null
}

export interface GoalShareInvite {
  id: string
  short_code: string
  goal_id: string
  created_by: string
  created_at: string
}

export interface PeriodNote {
  id: string
  user_id: string
  period_type: PeriodType
  period_date: string
  note: string
  created_at: string
}
