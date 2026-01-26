import express from 'express';
import dotenv from 'dotenv';
import logger from './config/logger';
import { schedulerService } from './services/scheduler';
import { reminderEngine } from './services/reminder-engine';
import { monitoringService } from './services/monitoring-service';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'development-admin-key';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin access control middleware
const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-admin-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    logger.warn(`Unauthorized admin access attempt from IP: ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes (Public/Standard)
app.get('/api/reminders/status', (req, res) => {
  const status = schedulerService.getStatus();
  res.json(status);
});

// Admin Monitoring Endpoints (Read-only)
app.get('/api/admin/metrics/subscriptions', adminAuth, async (req, res) => {
  try {
    const metrics = await monitoringService.getSubscriptionMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscription metrics' });
  }
});

app.get('/api/admin/metrics/renewals', adminAuth, async (req, res) => {
  try {
    const metrics = await monitoringService.getRenewalMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch renewal metrics' });
  }
});

app.get('/api/admin/metrics/activity', adminAuth, async (req, res) => {
  try {
    const metrics = await monitoringService.getAgentActivity();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agent activity' });
  }
});

// Manual trigger endpoints (for testing/admin - Should eventually be protected)
app.post('/api/reminders/process', adminAuth, async (req, res) => {
  try {
    await reminderEngine.processReminders();
    res.json({ success: true, message: 'Reminders processed' });
  } catch (error) {
    logger.error('Error processing reminders:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/reminders/schedule', adminAuth, async (req, res) => {
  try {
    const daysBefore = req.body.daysBefore || [7, 3, 1];
    await reminderEngine.scheduleReminders(daysBefore);
    res.json({ success: true, message: 'Reminders scheduled' });
  } catch (error) {
    logger.error('Error scheduling reminders:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/reminders/retry', adminAuth, async (req, res) => {
  try {
    await reminderEngine.processRetries();
    res.json({ success: true, message: 'Retries processed' });
  } catch (error) {
    logger.error('Error processing retries:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start scheduler
  schedulerService.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  schedulerService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  schedulerService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

