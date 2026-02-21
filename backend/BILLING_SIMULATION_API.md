# Billing Simulation API Documentation

## Overview

The Billing Simulation API provides users with a forward-looking view of their subscription expenses over a configurable time period. The system calculates when each active subscription will renew, projects multiple renewals for subscriptions that renew multiple times within the period, and aggregates this information into a comprehensive spending forecast.

## Endpoint

### Generate Billing Simulation

```http
GET /api/simulation
Authorization: Bearer <token>
```

**Query Parameters:**
- `days` (optional): Number of days to project (1-365, default: 30)
- `balance` (optional): Current balance for risk assessment

**Authentication:**
- Requires valid JWT token via `Authorization: Bearer <token>` header or `authToken` cookie

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "projections": [
      {
        "subscriptionId": "uuid",
        "subscriptionName": "Netflix",
        "provider": "Netflix",
        "amount": 15.99,
        "projectedDate": "2024-02-15T00:00:00.000Z",
        "billingCycle": "monthly",
        "category": "Entertainment"
      },
      {
        "subscriptionId": "uuid",
        "subscriptionName": "Spotify",
        "provider": "Spotify",
        "amount": 9.99,
        "projectedDate": "2024-02-20T00:00:00.000Z",
        "billingCycle": "monthly",
        "category": "Entertainment"
      }
    ],
    "summary": {
      "totalProjectedSpend": 25.98,
      "projectionPeriodDays": 30,
      "startDate": "2024-01-15T00:00:00.000Z",
      "endDate": "2024-02-14T00:00:00.000Z",
      "subscriptionCount": 2,
      "renewalCount": 2
    },
    "risk": {
      "insufficientBalance": false,
      "currentBalance": 100.00,
      "shortfall": 0
    }
  }
}
```

**Error Responses:**

400 Bad Request - Invalid parameters:
```json
{
  "success": false,
  "error": "Days parameter must be between 1 and 365"
}
```

401 Unauthorized - Missing or invalid authentication:
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

500 Internal Server Error:
```json
{
  "success": false,
  "error": "Failed to generate simulation"
}
```

## Features

### Subscription Filtering
- Only includes subscriptions with status `active` or `trial`
- Excludes subscriptions without a `next_billing_date`
- Automatically filters by authenticated user

### Billing Cycle Support
- **Monthly**: Projects renewals every 30 days
- **Quarterly**: Projects renewals every 90 days
- **Yearly**: Projects renewals every 365 days

### Multiple Renewals
- Automatically calculates all renewals within the projection period
- A monthly subscription in a 60-day period will show 2 renewals
- Renewals are sorted by date in ascending order

### Risk Assessment (Optional)
When `balance` parameter is provided:
- Compares total projected spend against current balance
- Flags `insufficientBalance` if spend exceeds balance
- Calculates `shortfall` amount when balance is insufficient

## Usage Examples

### Basic Simulation (30 days)
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/simulation
```

### Custom Period (60 days)
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/simulation?days=60"
```

### With Balance Risk Assessment
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/simulation?days=30&balance=50.00"
```

### Maximum Period (365 days)
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/simulation?days=365"
```

## Response Fields

### ProjectedRenewal
- `subscriptionId`: Unique identifier of the subscription
- `subscriptionName`: Display name of the subscription
- `provider`: Service provider name
- `amount`: Renewal amount (from subscription price)
- `projectedDate`: ISO 8601 formatted date of projected renewal
- `billingCycle`: Frequency of renewal (monthly, quarterly, yearly)
- `category`: Subscription category (nullable)

### SimulationSummary
- `totalProjectedSpend`: Sum of all projected renewal amounts
- `projectionPeriodDays`: Number of days in the projection period
- `startDate`: Start of projection period (current date)
- `endDate`: End of projection period (start + days)
- `subscriptionCount`: Number of unique subscriptions with renewals
- `renewalCount`: Total number of projected renewals

### RiskAssessment (optional)
- `insufficientBalance`: Boolean flag indicating if balance is insufficient
- `currentBalance`: The balance provided in the request
- `shortfall`: Amount by which spend exceeds balance (0 if sufficient)

## Business Logic

### Date Calculation
The system uses fixed-day intervals for predictable behavior:
- Monthly: 30 days
- Quarterly: 90 days
- Yearly: 365 days

This approach avoids complexities with varying month lengths and leap years.

### Projection Algorithm
1. Fetch all active/trial subscriptions with next_billing_date
2. For each subscription:
   - Start with next_billing_date
   - While date <= end of period:
     - Add renewal to projections
     - Calculate next renewal date (current + interval)
3. Sort all projections by date
4. Calculate summary statistics
5. Assess risk if balance provided

## Integration Notes

### Frontend Integration
```typescript
async function getSimulation(days: number = 30, balance?: number) {
  const params = new URLSearchParams({ days: days.toString() });
  if (balance !== undefined) {
    params.append('balance', balance.toString());
  }
  
  const response = await fetch(`/api/simulation?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}
```

### Caching Considerations
- Simulation results can be cached for short periods (5-10 minutes)
- Invalidate cache when subscriptions are created, updated, or deleted
- Cache key should include userId and days parameter

### Performance
- Typical response time: < 100ms
- Scales linearly with number of subscriptions
- No pagination needed (typical user has 5-20 subscriptions)

## Security

- All requests require authentication
- Users can only access their own subscription data
- Input validation prevents injection attacks
- Rate limiting recommended for production

## Future Enhancements

1. **Calendar Export**: Export projections to iCal format
2. **Spending Trends**: Compare to historical averages
3. **Custom Risk Thresholds**: User-defined warning levels
4. **Currency Support**: Multi-currency handling
5. **Notification Integration**: Alerts for high-risk periods
