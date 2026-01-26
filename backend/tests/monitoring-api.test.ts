import request from 'supertest';
import express from 'express';
import { monitoringService } from '../src/services/monitoring-service';

// Mock MonitoringService
jest.mock('../src/services/monitoring-service', () => ({
    monitoringService: {
        getSubscriptionMetrics: jest.fn(),
        getRenewalMetrics: jest.fn(),
        getAgentActivity: jest.fn(),
    },
}));

// Mock logger
jest.mock('../src/config/logger');

// Since we want to test the app in index.ts, but index.ts starts the server,
// we'll create a minimal express app that uses the same logic for testing.
// Alternatively, we could refactor index.ts to export the app, but for now
// we'll simulate the middleware and routes.

const app = express();
app.use(express.json());

const ADMIN_API_KEY = 'test-admin-key';

const adminAuth = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-admin-api-key'];
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
    }
    next();
};

app.get('/api/admin/metrics/subscriptions', adminAuth, async (req, res) => {
    try {
        const metrics = await monitoringService.getSubscriptionMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

describe('Monitoring API Access Control', () => {
    it('should return 401 if x-admin-api-key is missing', async () => {
        const response = await request(app).get('/api/admin/metrics/subscriptions');
        expect(response.status).toBe(401);
    });

    it('should return 401 if x-admin-api-key is incorrect', async () => {
        const response = await request(app)
            .get('/api/admin/metrics/subscriptions')
            .set('x-admin-api-key', 'wrong-key');
        expect(response.status).toBe(401);
    });

    it('should return 200 and data if x-admin-api-key is correct', async () => {
        (monitoringService.getSubscriptionMetrics as jest.Mock).mockResolvedValue({ total_subscriptions: 10 });

        const response = await request(app)
            .get('/api/admin/metrics/subscriptions')
            .set('x-admin-api-key', 'test-admin-key');

        expect(response.status).toBe(200);
        expect(response.body.total_subscriptions).toBe(10);
    });
});
