import { useEffect, useRef, useState } from "react";
import type { PermitData } from "../types.ts";
import { githubUsernameCache } from "../utils/github-cache.ts";

/**
 * Hook to fetch GitHub usernames for permits
 * Manages fetching and caching of GitHub usernames to avoid rate limits
 */
export function useGithubUsernames(permits: PermitData[]) {
  const [usernames, setUsernames] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const fetchedIdsRef = useRef<Set<number>>(new Set());
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const fetchUsernames = async () => {
      // Prevent concurrent fetching
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      // Collect unique user IDs that need fetching
      const uniqueUserIds = new Map<number, boolean>(); // Map to track unique IDs
      const cachedUsernames = new Map<number, string>();

      permits.forEach((permit) => {
        if (permit.beneficiaryUserId && !uniqueUserIds.has(permit.beneficiaryUserId)) {
          uniqueUserIds.set(permit.beneficiaryUserId, true);
          
          // Check cache first
          const cached = githubUsernameCache.get(String(permit.beneficiaryUserId));
          if (cached) {
            cachedUsernames.set(permit.beneficiaryUserId, cached);
          }
        }
      });

      // Get IDs that need fetching (not cached and not already fetched in this session)
      const userIdsToFetch = Array.from(uniqueUserIds.keys()).filter(
        id => !cachedUsernames.has(id) && !fetchedIdsRef.current.has(id)
      );

      // If we have all usernames cached or already fetched, just update state
      if (userIdsToFetch.length === 0) {
        setUsernames(prev => {
          const merged = new Map(prev);
          cachedUsernames.forEach((username, id) => {
            merged.set(id, username);
          });
          return merged;
        });
        isFetchingRef.current = false;
        return;
      }

      setIsLoading(true);

      try {
        // Fetch in batches to respect rate limits (60 requests/hour = 1 per minute average)
        // We'll fetch 20 at once initially, then smaller batches with delays
        const INITIAL_BATCH_SIZE = 20; // Fetch 20 initially (1/3 of hourly limit)
        const SUBSEQUENT_BATCH_SIZE = 10; // Then 10 at a time
        const BATCH_DELAY = 3000; // 3 seconds between batches to be safe with rate limits
        
        for (let i = 0; i < userIdsToFetch.length; ) {
          // Use larger batch for first request, smaller for subsequent
          const batchSize = i === 0 ? INITIAL_BATCH_SIZE : SUBSEQUENT_BATCH_SIZE;
          const batch = userIdsToFetch.slice(i, i + batchSize);
          i += batchSize;
          
          // Mark these IDs as being fetched
          batch.forEach(id => fetchedIdsRef.current.add(id));
          
          // Fetch this batch
          const fetchPromises = batch.map(userId => 
            githubUsernameCache.fetchUsername(userId).then(username => ({ userId, username }))
          );
          
          const results = await Promise.all(fetchPromises);
          
          results.forEach(({ userId, username }) => {
            if (username) {
              cachedUsernames.set(userId, username);
            }
          });
          
          // Update state with the new batch of usernames
          setUsernames(prev => {
            const merged = new Map(prev);
            cachedUsernames.forEach((username, id) => {
              merged.set(id, username);
            });
            return merged;
          });
          
          // If there are more batches to fetch, wait before continuing
          if (i < userIdsToFetch.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        }
      } catch (error) {
        console.error("Error fetching GitHub usernames:", error);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    };

    if (permits.length > 0) {
      fetchUsernames();
    }
  }, [permits]);

  return { usernames, isLoading };
}