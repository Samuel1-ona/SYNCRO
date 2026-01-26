export interface ReminderSchedule {
  id: string;
  subscription_id: string;
  user_id: string;
  reminder_date: string;
  reminder_type: 'renewal' | 'trial_expiry' | 'cancellation';
  days_before: number;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface NotificationDelivery {
  id: string;
  reminder_schedule_id: string;
  user_id: string;
  channel: 'email' | 'push';
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempt_count: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  category: string;
  price: number;
  active_until: string | null;
  status: string;
  billing_cycle: string;
  renewal_url: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  timezone: string;
  currency: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  subscription: Subscription;
  reminderType: ReminderSchedule['reminder_type'];
  daysBefore: number;
  renewalDate: string;
}

export interface DeliveryResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface UserPreferences {
  user_id: string;
  notification_channels: ('email' | 'push')[];
  reminder_timing: number[]; // days before
  email_opt_ins: {
    marketing: boolean;
    reminders: boolean;
    updates: boolean;
  };
  automation_flags: {
    auto_renew: boolean;
    auto_retry: boolean;
  };
  updated_at: string;
}

export type PartialUserPreferences = Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>;

