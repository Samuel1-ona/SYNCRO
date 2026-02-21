import cron from 'node-cron';
import logger from '../config/logger';
import { reminderEngine } from './reminder-engine';
import { expiryService } from './expiry-service';

export class SchedulerService {
  private jobs: cron.ScheduledTask[] = [];

  /**
   * Start all scheduled jobs
   */
  start(): void {
    logger.info('Starting scheduler service');

    // Schedule reminder processing - runs daily at 9 AM UTC
    const reminderJob = cron.schedule('0 9 * * *', async () => {
      logger.info('Running scheduled reminder processing');
      try {
        await reminderEngine.processReminders();
      } catch (error) {
        logger.error('Error in scheduled reminder processing:', error);
      }
    });

    this.jobs.push(reminderJob);

    // Schedule reminder scheduling - runs daily at midnight UTC
    const schedulingJob = cron.schedule('0 0 * * *', async () => {
      logger.info('Running scheduled reminder scheduling');
      try {
        await reminderEngine.scheduleReminders();
      } catch (error) {
        logger.error('Error in scheduled reminder scheduling:', error);
      }
    });

    this.jobs.push(schedulingJob);

    // Schedule retry processing - runs every 30 minutes
    const retryJob = cron.schedule('*/30 * * * *', async () => {
      logger.info('Running scheduled retry processing');
      try {
        await reminderEngine.processRetries();
      } catch (error) {
        logger.error('Error in scheduled retry processing:', error);
      }
    });

    this.jobs.push(retryJob);

    // Schedule expiry processing - runs daily at 2 AM UTC
    const expiryJob = cron.schedule('0 2 * * *', async () => {
      logger.info('Running scheduled expiry processing');
      try {
        await expiryService.processExpiries();
      } catch (error) {
        logger.error('Error in scheduled expiry processing:', error);
      }
    });

    this.jobs.push(expiryJob);

    logger.info(`Started ${this.jobs.length} scheduled jobs`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    logger.info('Stopping scheduler service');
    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
    logger.info('Scheduler service stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus(): { running: boolean; jobCount: number } {
    return {
      running: this.jobs.length > 0,
      jobCount: this.jobs.length,
    };
  }
}

export const schedulerService = new SchedulerService();

