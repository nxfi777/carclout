/**
 * Retry a function with exponential backoff on SurrealDB transaction conflicts
 */
export async function retryOnConflict<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 100
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Only retry on transaction conflicts
      if (
        error instanceof Error &&
        (error.message.includes("read or write conflict") ||
          error.message.includes("Failed to commit transaction"))
      ) {
        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (process.env.NODE_ENV === "development") {
            console.log(`Retrying transaction (attempt ${attempt + 2}/${maxRetries + 1})`);
          }
          continue;
        }
      }
      
      // If it's not a conflict error or we're out of retries, throw
      throw error;
    }
  }
  
  throw lastError || new Error("Max retries exceeded");
}
