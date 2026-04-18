export type User = {
  id: number;
  username: string;
  email: string;
  role: string;
  balance_vnd: number;
  email_verified: boolean;
  free_trial_used: boolean;
  referral_code: string;
  last_spin_date: string | null;
  created_at: string | null;
  /** Gói Pro (pro_month / pro_year / …) */
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
  subscription_active?: boolean;
  subscription_status?: "none" | "active" | "expired";
  /** Khi còn hạn: "Tháng" | "Năm" | "Pro" */
  subscription_plan_label?: string | null;
  /** Bắt đầu chu kỳ hiện tại (sau duyệt) */
  subscription_period_started_at?: string | null;
  /** Lần thanh toán / gia hạn gần nhất */
  subscription_last_paid_at?: string | null;
  subscription_plan_title?: string | null;
  subscription_plan_bullets?: string[];
  subscription_plan_amount_vnd?: number | null;
  subscription_plan_duration_days?: number | null;
  subscription_privileges?: string[];
};

export type VideoHit = {
  video_id: string;
  title: string;
  pic: string;
  duration: string;
  duration_seconds: number;
  author: string;
};
