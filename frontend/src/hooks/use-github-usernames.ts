import { useEffect, useState } from "react";
import type { PermitData } from "../types.ts";
import { githubUsernameCache } from "../utils/github-cache.ts";

/**
 * Hook to fetch GitHub usernames for permits
 * Manages fetching and caching of GitHub usernames to avoid rate limits
 */
export function useGithubUsernames(permits: PermitData[]) {
  const [usernames, setUsernames] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchUsernames = async () => {
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

      // Get IDs that need fetching
      const userIdsToFetch = Array.from(uniqueUserIds.keys()).filter(
        id => !cachedUsernames.has(id)
      );

      // If we have all usernames cached, just update state
      if (userIdsToFetch.length === 0) {
        setUsernames(cachedUsernames);
        return;
      }

      setIsLoading(true);

      try {
        // Fetch uncached usernames (limited to avoid rate limits)
        const MAX_FETCH = 10; // Limit to 10 unique requests to stay well under rate limit
        const idsToFetch = userIdsToFetch.slice(0, MAX_FETCH);
        
        // Use Promise.all to fetch in parallel, the cache will handle deduplication
        const fetchPromises = idsToFetch.map(userId => 
          githubUsernameCache.fetchUsername(userId).then(username => ({ userId, username }))
        );
        
        const results = await Promise.all(fetchPromises);
        
        results.forEach(({ userId, username }) => {
          if (username) {
            cachedUsernames.set(userId, username);
          }
        });

        setUsernames(cachedUsernames);
      } catch (error) {
        console.error("Error fetching GitHub usernames:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (permits.length > 0) {
      fetchUsernames();
    }
  }, [permits]);

  return { usernames, isLoading };
}