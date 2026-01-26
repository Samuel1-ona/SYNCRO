import logger from '../config/logger';
import { supabase } from '../config/database';
import { emailService } from './email-service';
import { pushService, PushSubscription } from './push-service';
import { blockchainService } from './blockchain-service';
import {
  ReminderSchedule,
  Subscription,
  UserProfile,
  NotificationPayload,
  NotificationDelivery,
} from '../types/reminder';
import { calculateBackoffDelay } from '../utils/retry';
import { userPreferenceService } from './user-preference-service';

export interface ReminderEngineOptions {
  defaultDaysBefore?: number[];
  maxRetryAttempts?: number;
}

export class ReminderEngine {
  private defaultDaysBefore: number[];
  private maxRetryAttempts: number;

  constructor(options: ReminderEngineOptions = {}) {
    this.defaultDaysBefore = options.defaultDaysBefore || [7, 3, 1];
    this.maxRetryAttempts = options.maxRetryAttempts || 3;
  }

  /**
   * Process pending reminders for a given date
   */
  async processReminders(targetDate: Date = new Date()): Promise<void> {
    const dateString = targetDate.toISOString().split('T')[0];

    logger.info(`Processing reminders for date: ${dateString}`);

    try {
      // Fetch all pending reminders for the target date
      const { data: reminders, error } = await supabase
        .from('reminder_schedules')
        .select('*')
        .eq('reminder_date', dateString)
        .eq('status', 'pending');

      if (error) {
        logger.error('Failed to fetch reminders:', error);
        throw error;
      }

      if (!reminders || reminders.length === 0) {
        logger.info(`No pending reminders found for ${dateString}`);
        return;
      }

      logger.info(`Found ${reminders.length} reminders to process`);

      // Process each reminder
      for (const reminder of reminders) {
        try {
          await this.processReminder(reminder);
        } catch (error) {
          logger.error(`Failed to process reminder ${reminder.id}:`, error);
          // Continue processing other reminders
        }
      }
    } catch (error) {
      logger.error('Error processing reminders:', error);
      throw error;
    }
  }

  /**
   * Process a single reminder
   */
  private async processReminder(reminder: ReminderSchedule): Promise<void> {
    logger.info(`Processing reminder ${reminder.id} for subscription ${reminder.subscription_id}`);

    try {
      // Fetch subscription details
      const subscription = await this.getSubscription(reminder.subscription_id);
      if (!subscription) {
        logger.warn(`Subscription ${reminder.subscription_id} not found`);
        await this.markReminderAsFailed(reminder.id, 'Subscription not found');
        return;
      }

      // Fetch user profile
      const userProfile = await this.getUserProfile(reminder.user_id);
      if (!userProfile) {
        logger.warn(`User profile ${reminder.user_id} not found`);
        await this.markReminderAsFailed(reminder.id, 'User profile not found');
        return;
      }

      // Create notification payload
      const renewalDate = subscription.active_until || new Date().toISOString();
      const payload: NotificationPayload = {
        title: `${subscription.name} Renewal Reminder`,
        body: `${subscription.name} will renew in ${reminder.days_before} day${reminder.days_before > 1 ? 's' : ''}`,
        subscription,
        reminderType: reminder.reminder_type,
        daysBefore: reminder.days_before,
        renewalDate,
      };

      // Determine delivery channels (check user preferences, default to email)
      const preferences = await userPreferenceService.getPreferences(reminder.user_id);
      const deliveryChannels = preferences.notification_channels;

      // Create delivery records
      const deliveries: NotificationDelivery[] = [];

      // Send email notification
      if (deliveryChannels.includes('email') && preferences.email_opt_ins.reminders) {
        const emailDelivery = await this.createDeliveryRecord(
          reminder.id,
          reminder.user_id,
          'email'
        );
        deliveries.push(emailDelivery);

        const emailResult = await emailService.sendReminderEmail(
          userProfile.email,
          payload,
          { maxAttempts: this.maxRetryAttempts }
        );

        await this.updateDeliveryRecord(
          emailDelivery.id,
          emailResult.success ? 'sent' : 'failed',
          emailResult.error,
          emailResult.metadata
        );
      }

      // Send push notification (if enabled)
      if (deliveryChannels.includes('push')) {
        const pushSubscription = await this.getPushSubscription(reminder.user_id);
        if (pushSubscription) {
          const pushDelivery = await this.createDeliveryRecord(
            reminder.id,
            reminder.user_id,
            'push'
          );
          deliveries.push(pushDelivery);

          const pushResult = await pushService.sendPushNotification(
            pushSubscription,
            payload,
            { maxAttempts: this.maxRetryAttempts }
          );

          await this.updateDeliveryRecord(
            pushDelivery.id,
            pushResult.success ? 'sent' : 'failed',
            pushResult.error,
            pushResult.metadata
          );
        }
      }

      // Log to blockchain
      await blockchainService.logReminderEvent(
        reminder.user_id,
        payload,
        deliveryChannels
      );

      // Check if at least one delivery succeeded
      const hasSuccess = deliveries.some(
        (d) => d.status === 'sent' || d.status === 'retrying'
      );

      // Update reminder status
      await supabase
        .from('reminder_schedules')
        .update({
          status: hasSuccess ? 'sent' : 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reminder.id);

      logger.info(`Reminder ${reminder.id} processed successfully`);
    } catch (error) {
      logger.error(`Error processing reminder ${reminder.id}:`, error);
      await this.markReminderAsFailed(reminder.id, String(error));
      throw error;
    }
  }

  /**
   * Process failed deliveries that need retry
   */
  async processRetries(): Promise<void> {
    const now = new Date().toISOString();

    logger.info('Processing delivery retries');

    try {
      // Fetch deliveries that need retry
      const { data: deliveries, error } = await supabase
        .from('notification_deliveries')
        .select('*, reminder_schedules!inner(*)')
        .eq('status', 'retrying')
        .lte('next_retry_at', now)
        .lt('attempt_count', this.maxRetryAttempts);

      if (error) {
        logger.error('Failed to fetch retry deliveries:', error);
        throw error;
      }

      if (!deliveries || deliveries.length === 0) {
        logger.info('No deliveries need retry');
        return;
      }

      logger.info(`Found ${deliveries.length} deliveries to retry`);

      for (const delivery of deliveries) {
        try {
          await this.retryDelivery(delivery as NotificationDelivery & { reminder_schedules: ReminderSchedule });
        } catch (error) {
          logger.error(`Failed to retry delivery ${delivery.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error processing retries:', error);
      throw error;
    }
  }

  /**
   * Retry a failed delivery
   */
  private async retryDelivery(
    delivery: NotificationDelivery & { reminder_schedules: ReminderSchedule }
  ): Promise<void> {
    const reminder = delivery.reminder_schedules;
    const newAttemptCount = delivery.attempt_count + 1;

    logger.info(
      `Retrying delivery ${delivery.id} (attempt ${newAttemptCount}/${this.maxRetryAttempts})`
    );

    try {
      // Fetch subscription and user profile
      const subscription = await this.getSubscription(reminder.subscription_id);
      const userProfile = await this.getUserProfile(delivery.user_id);

      if (!subscription || !userProfile) {
        await this.markDeliveryAsFailed(delivery.id, 'Subscription or user not found');
        return;
      }

      const renewalDate = subscription.active_until || new Date().toISOString();
      const payload: NotificationPayload = {
        title: `${subscription.name} Renewal Reminder`,
        body: `${subscription.name} will renew in ${reminder.days_before} day${reminder.days_before > 1 ? 's' : ''}`,
        subscription,
        reminderType: reminder.reminder_type,
        daysBefore: reminder.days_before,
        renewalDate,
      };

      let result: { success: boolean; error?: string; metadata?: Record<string, any> };

      if (delivery.channel === 'email') {
        result = await emailService.sendReminderEmail(
          userProfile.email,
          payload,
          { maxAttempts: 1 } // Single attempt since we're retrying
        );
      } else if (delivery.channel === 'push') {
        const pushSubscription = await this.getPushSubscription(delivery.user_id);
        if (!pushSubscription) {
          await this.markDeliveryAsFailed(delivery.id, 'Push subscription not found');
          return;
        }
        result = await pushService.sendPushNotification(
          pushSubscription,
          payload,
          { maxAttempts: 1 }
        );
      } else {
        await this.markDeliveryAsFailed(delivery.id, `Unknown channel: ${delivery.channel}`);
        return;
      }

      // Update delivery record
      if (result.success) {
        await supabase
          .from('notification_deliveries')
          .update({
            status: 'sent',
            attempt_count: newAttemptCount,
            last_attempt_at: new Date().toISOString(),
            next_retry_at: null,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', delivery.id);
      } else {
        // Calculate next retry time
        const delay = calculateBackoffDelay(newAttemptCount);
        const nextRetryAt = new Date(Date.now() + delay);

        if (newAttemptCount >= this.maxRetryAttempts) {
          // Max attempts reached, mark as failed
          await this.markDeliveryAsFailed(delivery.id, result.error || 'Max attempts reached');
        } else {
          // Schedule next retry
          await supabase
            .from('notification_deliveries')
            .update({
              status: 'retrying',
              attempt_count: newAttemptCount,
              last_attempt_at: new Date().toISOString(),
              next_retry_at: nextRetryAt.toISOString(),
              error_message: result.error || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', delivery.id);
        }
      }
    } catch (error) {
      logger.error(`Error retrying delivery ${delivery.id}:`, error);
      await this.markDeliveryAsFailed(delivery.id, String(error));
    }
  }

  /**
   * Schedule reminders for subscriptions with upcoming renewals
   */
  async scheduleReminders(daysBefore: number[] = this.defaultDaysBefore): Promise<void> {
    logger.info(`Scheduling reminders for days before: ${daysBefore.join(', ')}`);

    try {
      // Fetch active subscriptions with future renewal dates
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('status', 'active')
        .not('active_until', 'is', null)
        .gt('active_until', new Date().toISOString());

      if (error) {
        logger.error('Failed to fetch subscriptions:', error);
        throw error;
      }

      if (!subscriptions || subscriptions.length === 0) {
        logger.info('No active subscriptions with future renewal dates');
        return;
      }

      logger.info(`Found ${subscriptions.length} subscriptions to schedule reminders for`);

      for (const subscription of subscriptions) {
        if (!subscription.active_until) continue;

        // Fetch user preferences for reminder timing
        const preferences = await userPreferenceService.getPreferences(subscription.user_id);
        const userDaysBefore = preferences.reminder_timing;

        const renewalDate = new Date(subscription.active_until);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const days of userDaysBefore) {
          const reminderDate = new Date(renewalDate);
          reminderDate.setDate(reminderDate.getDate() - days);
          reminderDate.setHours(0, 0, 0, 0);

          // Only schedule if reminder date is in the future
          if (reminderDate >= today) {
            // Check if reminder already exists
            const { data: existing } = await supabase
              .from('reminder_schedules')
              .select('id')
              .eq('subscription_id', subscription.id)
              .eq('days_before', days)
              .eq('status', 'pending')
              .single();

            if (!existing) {
              // Create reminder schedule
              await supabase.from('reminder_schedules').insert({
                subscription_id: subscription.id,
                user_id: subscription.user_id,
                reminder_date: reminderDate.toISOString().split('T')[0],
                reminder_type: 'renewal',
                days_before: days,
                status: 'pending',
              });

              logger.debug(
                `Scheduled reminder for subscription ${subscription.id} (${days} days before)`
              );
            }
          }
        }
      }

      logger.info('Reminder scheduling completed');
    } catch (error) {
      logger.error('Error scheduling reminders:', error);
      throw error;
    }
  }

  // Helper methods

  private async getSubscription(id: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return data as Subscription;
  }

  private async getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;

    // Try to get email from auth.users (service role key allows admin access)
    let email = data.email || '';
    try {
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
      if (!authError && authUser?.user?.email) {
        email = authUser.user.email;
      }
    } catch (authErr) {
      logger.warn(`Could not fetch email from auth.users for user ${userId}:`, authErr);
    }

    // Fallback: try to get email from email_accounts (get first connected account)
    if (!email) {
      const { data: emailAccount } = await supabase
        .from('email_accounts')
        .select('email')
        .eq('user_id', userId)
        .eq('is_connected', true)
        .limit(1)
        .single();

      if (emailAccount) {
        email = emailAccount.email;
      }
    }

    if (!email) {
      logger.error(`No email found for user ${userId}`);
      return null;
    }

    return {
      id: data.id,
      email,
      full_name: data.full_name || data.display_name || null,
      timezone: data.timezone || 'UTC',
      currency: data.currency || 'USD',
    };
  }

  private async getPushSubscription(userId: string): Promise<PushSubscription | null> {
    // TODO: Fetch push subscription from user preferences/settings table
    // For now, return null (push notifications not fully implemented)
    return null;
  }

  private async createDeliveryRecord(
    reminderScheduleId: string,
    userId: string,
    channel: 'email' | 'push'
  ): Promise<NotificationDelivery> {
    const { data, error } = await supabase
      .from('notification_deliveries')
      .insert({
        reminder_schedule_id: reminderScheduleId,
        user_id: userId,
        channel,
        status: 'pending',
        attempt_count: 0,
        max_attempts: this.maxRetryAttempts,
      })
      .select()
      .single();

    if (error) throw error;
    return data as NotificationDelivery;
  }

  private async updateDeliveryRecord(
    deliveryId: string,
    status: 'sent' | 'failed' | 'retrying',
    errorMessage: string | undefined,
    metadata: Record<string, any> | undefined
  ): Promise<void> {
    const updateData: any = {
      status,
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (metadata) {
      updateData.metadata = metadata;
    }

    if (status === 'retrying') {
      const delay = calculateBackoffDelay(1);
      updateData.next_retry_at = new Date(Date.now() + delay).toISOString();
    }

    const { error } = await supabase
      .from('notification_deliveries')
      .update(updateData)
      .eq('id', deliveryId);

    if (error) throw error;
  }

  private async markDeliveryAsFailed(
    deliveryId: string,
    errorMessage: string
  ): Promise<void> {
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);
  }

  private async markReminderAsFailed(
    reminderId: string,
    errorMessage: string
  ): Promise<void> {
    await supabase
      .from('reminder_schedules')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminderId);
  }
}

export const reminderEngine = new ReminderEngine();

