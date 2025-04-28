import { LRUCache } from 'lru-cache';

// Configuration Constants
const WINDOW_SIZE_IN_HOURS = 1;
const MAX_WINDOW_REQUEST_COUNT = 100;
const WINDOW_LOG_INTERVAL_IN_HOURS = 1;

// Options for LRUCache
const options = {
  max: 500, // Max users to track
  ttl: WINDOW_SIZE_IN_HOURS * 60 * 60 * 1000, // Time-to-live in milliseconds
  ttlAutopurge: true, // Automatically remove expired items
};

// Initialize LRU cache to store request timestamps for each identifier
const requestCounts = new LRUCache<string, number[]>(options);

interface RateLimitResult {
  isAllowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
}

/**
 * Checks if a request from a given identifier is within the rate limits.
 * Uses a simple in-memory LRU cache sliding window approach.
 *
 * @param identifier - A unique identifier for the requester (e.g., user ID or IP address).
 * @returns An object indicating if the request is allowed and the current limit status.
 */
export const checkRateLimit = (identifier: string): RateLimitResult => {
  const currentTime = Date.now();
  const windowStartTime = currentTime - WINDOW_SIZE_IN_HOURS * 60 * 60 * 1000;

  // Get the list of timestamps for this identifier, or initialize if not present
  const userTimestamps = requestCounts.get(identifier) || [];

  // Filter out timestamps older than the window start time
  const recentTimestamps = userTimestamps.filter(
    (timestamp: number) => timestamp > windowStartTime
  );

  const isAllowed = recentTimestamps.length < MAX_WINDOW_REQUEST_COUNT;
  let remaining = MAX_WINDOW_REQUEST_COUNT - recentTimestamps.length;

  // Calculate the reset time (when the oldest request in the window expires)
  let resetTimeTimestamp = windowStartTime + WINDOW_SIZE_IN_HOURS * 60 * 60 * 1000; // Default reset is end of window
  if (recentTimestamps.length >= MAX_WINDOW_REQUEST_COUNT && recentTimestamps.length > 0) {
      resetTimeTimestamp = recentTimestamps[0] + WINDOW_SIZE_IN_HOURS * 60 * 60 * 1000;
  }
  const resetTime = new Date(resetTimeTimestamp);

  if (isAllowed) {
    // Add the current timestamp to the list
    recentTimestamps.push(currentTime);
    // Update the cache
    requestCounts.set(identifier, recentTimestamps);
    remaining--; // Decrement remaining count after adding current request
  }

  return {
    isAllowed,
    limit: MAX_WINDOW_REQUEST_COUNT,
    remaining: Math.max(0, remaining), // Ensure remaining is not negative
    resetTime,
  };
};

// Basic function to log cache size periodically (optional)
// setInterval(() => {
//   console.log(`Rate Limit Cache Size: ${requestCounts.size}`);
// }, WINDOW_LOG_INTERVAL_IN_HOURS * 60 * 60 * 1000);

export {}; 