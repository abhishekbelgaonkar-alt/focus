export type GoalStatus = 'active' | 'completed' | 'abandoned'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type EndReason = 'on_time' | 'still_focused' | 'distracted' | 'forgot_to_end' | 'other'
export type PeriodType = 'day' | 'week' | 'month'

export interface Goal {
  id: string
  user_id: string
  name: string
  status: GoalStatus
  schedule: Weekday[] | null
  last_used_duration_minutes: number | null
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Session {
  id: string
  user_id: string
  goal_id: string | null
  category_id: string | null
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

export interface DistractionTag {
  id: string
  user_id: string
  name: string
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

export interface PeriodNote {
  id: string
  user_id: string
  period_type: PeriodType
  period_date: string
  note: string
  created_at: string
}
