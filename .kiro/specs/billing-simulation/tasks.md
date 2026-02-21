# Implementation Plan

- [x] 1. Create simulation service with core projection logic
  - Implement `SimulationService` class in `backend/src/services/simulation-service.ts`
  - Implement `calculateNextRenewal` function for date calculations
  - Implement `projectSubscriptionRenewals` function to generate renewals for a single subscription
  - Implement `generateSimulation` function to orchestrate the full simulation
  - Add input validation for days parameter (1-365)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 6.2, 6.3, 6.4, 6.5_

- [ ]* 1.1 Write property test for renewal date intervals
  - **Property 2: Renewal date calculation preserves billing cycle intervals**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [ ]* 1.2 Write property test for projection period boundaries
  - **Property 1: All projected renewals fall within projection period**
  - **Validates: Requirements 1.4, 1.5**

- [ ]* 1.3 Write property test for total spend calculation
  - **Property 3: Total projected spend equals sum of all renewal amounts**
  - **Validates: Requirements 3.1, 3.2**

- [ ]* 1.4 Write property test for subscription filtering
  - **Property 4: Subscriptions without next_billing_date are excluded**
  - **Property 5: Only active and trial subscriptions are included**
  - **Validates: Requirements 1.2, 1.3**

- [ ]* 1.5 Write property test for renewal count accuracy
  - **Property 6: Renewal count matches projection array length**
  - **Validates: Requirements 3.2**

- [ ]* 1.6 Write property test for empty projections
  - **Property 8: Empty projections yield zero spend**
  - **Validates: Requirements 3.3**

- [x] 2. Create API route handler for simulation endpoint
  - Create `backend/src/routes/simulation.ts` file
  - Implement `GET /api/simulation` endpoint
  - Add authentication middleware to protect the endpoint
  - Add query parameter parsing for `days` parameter
  - Call simulation service and format response
  - Add error handling for validation and server errors
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1_

- [ ]* 2.1 Write property test for authorization
  - **Property: Users only see their own subscription projections**
  - **Validates: Requirements 5.3**

- [ ]* 2.2 Write unit tests for API endpoint
  - Test successful simulation request returns 200
  - Test unauthenticated request returns 401
  - Test invalid days parameter returns 400
  - Test days parameter defaults to 30
  - Test response structure matches expected format
  - _Requirements: 5.2, 5.4, 5.5, 6.3, 6.4, 6.5_

- [x] 3. Add balance risk assessment logic
  - Extend `generateSimulation` to accept optional balance parameter
  - Implement risk calculation logic
  - Add risk object to response when balance is provided
  - Calculate shortfall amount when insufficient balance detected
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 3.1 Write property test for risk assessment
  - **Property 7: Insufficient balance risk is correctly identified**
  - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 4. Integrate simulation route into main application
  - Import simulation routes in `backend/src/index.ts`
  - Mount simulation routes at `/api/simulation`
  - Ensure CORS configuration includes simulation endpoint
  - Test endpoint is accessible from frontend
  - _Requirements: 5.1_

- [ ]* 4.1 Write property test for projected renewal structure
  - **Property: All projected renewals contain required fields**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 5. Add TypeScript type definitions
  - Create types in `backend/src/types/simulation.ts`
  - Define `ProjectedRenewal` interface
  - Define `SimulationResult` interface
  - Define `SimulationSummary` interface
  - Define `RiskAssessment` interface
  - Export all types for use in service and routes
  - _Requirements: All (type safety)_

- [ ]* 5.1 Write property test for input validation
  - **Property 9: Projection period validation**
  - **Validates: Requirements 6.4, 6.5**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
