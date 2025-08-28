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
        // Just fetch everything we can in one shot (up to 60 for rate limit)
        // Cache handles most requests, so we just need to handle cache misses
        const MAX_BATCH_SIZE = 60; // GitHub's hourly rate limit for unauthenticated requests
        const batch = userIdsToFetch.slice(0, MAX_BATCH_SIZE);
        
        // Mark these IDs as being fetched
        batch.forEach(id => fetchedIdsRef.current.add(id));
        
        // Fetch all at once
        const fetchPromises = batch.map(userId => 
          githubUsernameCache.fetchUsername(userId).then(username => ({ userId, username }))
        );
        
        const results = await Promise.all(fetchPromises);
        
        results.forEach(({ userId, username }) => {
          if (username) {
            cachedUsernames.set(userId, username);
          }
        });
        
        // Update state with all the usernames
        setUsernames(prev => {
          const merged = new Map(prev);
          cachedUsernames.forEach((username, id) => {
            merged.set(id, username);
          });
          return merged;
        });
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