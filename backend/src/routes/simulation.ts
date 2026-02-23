import { Router, Response } from 'express';
import { simulationService } from '../services/simulation-service';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import logger from '../config/logger';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/simulation
 * Generate billing simulation for the authenticated user
 * 
 * Query Parameters:
 * - days (optional): Number of days to project (1-365, default: 30)
 * - balance (optional): Current balance for risk assessment
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Parse and validate query parameters
    const daysParam = req.query.days as string | undefined;
    const balanceParam = req.query.balance as string | undefined;

    let days = 30; // Default value
    if (daysParam) {
      const parsedDays = parseInt(daysParam, 10);
      
      if (isNaN(parsedDays)) {
        return res.status(400).json({
          success: false,
          error: 'Days parameter must be a valid number',
        });
      }
      
      if (parsedDays < 1 || parsedDays > 365) {
        return res.status(400).json({
          success: false,
          error: 'Days parameter must be between 1 and 365',
        });
      }
      
      days = parsedDays;
    }

    // Parse balance if provided
    let balance: number | undefined;
    if (balanceParam) {
      const parsedBalance = parseFloat(balanceParam);
      
      if (isNaN(parsedBalance)) {
        return res.status(400).json({
          success: false,
          error: 'Balance parameter must be a valid number',
        });
      }
      
      balance = parsedBalance;
    }

    // Generate simulation
    const result = await simulationService.generateSimulation(
      req.user!.id,
      days,
      balance
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Simulation generation error:', error);
    
    // Handle validation errors
    if (error instanceof Error && error.message.includes('must be between')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    
    // Handle other errors
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate simulation',
    });
  }
});

export default router;
