import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'development-admin-key';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-admin-api-key'];
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        logger.warn(`Unauthorized admin access attempt from IP: ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
    }
    next();
};
