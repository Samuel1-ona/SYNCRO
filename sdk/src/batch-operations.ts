/**
 * Batch Operation Helper
 * Runs multiple async operations in parallel with graceful partial failure handling.
 * Returns array of individual results; failures don't block successes.
 */

export interface BatchResultItem<T, K = string> {
  id: K;
  success: boolean;
  data?: T;
  error?: string;
}

export interface BatchResult<T, K = string> {
  results: BatchResultItem<T, K>[];
  successCount: number;
  failureCount: number;
}

/**
 * Runs a batch of async operations, collecting individual results.
 * Partial failures are handled gracefully - each operation's result is captured independently.
 */
export async function runBatch<T, K = string>(
  ids: K[],
  operation: (id: K) => Promise<{ success: boolean; data?: T; error?: string }>,
): Promise<BatchResult<T, K>> {
  if (!ids || ids.length === 0) {
    return { results: [], successCount: 0, failureCount: 0 };
  }

  const promises = ids.map(async (id): Promise<BatchResultItem<T, K>> => {
    try {
      const result = await operation(id);
      return {
        id,
        success: result.success,
        data: result.data,
        error: result.error,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { id, success: false, error: errorMessage };
    }
  });

  const results = await Promise.all(promises);
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return { results, successCount, failureCount };
}
