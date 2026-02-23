// src/middleware/rate-limiter.ts
import { Request, Response, NextFunction } from 'express';

// Memory store (In a massive production app, you'd use Redis)
const counts = new Map<string, { count: number; lastReset: number }>();

export const renewalRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const merchantId = req.params.id || req.body.id;
    const now = Date.now();
    const WINDOW_MS = 60000; // 1 minute window
    const MAX_ATTEMPTS = 5;  // Adjust this number as needed

    if (!merchantId) return next(); // If no ID, skip (or handle error)

    const record = counts.get(merchantId);

    // If no record or window expired, reset the counter
    if (!record || (now - record.lastReset) > WINDOW_MS) {
        counts.set(merchantId, { count: 1, lastReset: now });
        return next();
    }

    // Check if limit reached
    if (record.count >= MAX_ATTEMPTS) {
        return res.status(429).json({
            success: false,
            error: 'Too many renewal/update attempts for this merchant. Please try again in a minute.',
        });
    }

    // Increment and continue
    record.count++;
    next();
};