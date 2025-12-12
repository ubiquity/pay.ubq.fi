import { useEffect, useRef, useState } from "react";
import type { PermitData } from "../types.ts";
import { githubUsernameCache } from "../utils/github-cache.ts";

/**
 * Hook to fetch GitHub usernames for permits.
 * Manages fetching and caching of GitHub usernames to avoid rate limits.
 */
export function useGithubUsernames(permits: PermitData[]) {
  const [usernames, setUsernames] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const fetchedIdsRef = useRef<Set<number>>(new Set());
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const fetchUsernames = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      const uniqueUserIds = new Map<number, boolean>();
      const cachedUsernames = new Map<number, string>();

      permits.forEach((permit) => {
        if (permit.beneficiaryUserId && !uniqueUserIds.has(permit.beneficiaryUserId)) {
          uniqueUserIds.set(permit.beneficiaryUserId, true);

          const cached = githubUsernameCache.get(String(permit.beneficiaryUserId));
          if (cached) {
            cachedUsernames.set(permit.beneficiaryUserId, cached);
          }
        }
      });

      const userIdsToFetch = Array.from(uniqueUserIds.keys()).filter((id) => !cachedUsernames.has(id) && !fetchedIdsRef.current.has(id));

      if (userIdsToFetch.length === 0) {
        setUsernames((prev) => {
          const merged = new Map(prev);
          cachedUsernames.forEach((username, id) => merged.set(id, username));
          return merged;
        });
        isFetchingRef.current = false;
        return;
      }

      setIsLoading(true);

      try {
        const MAX_BATCH_SIZE = 60; // unauthenticated GitHub rate limit per hour
        const batch = userIdsToFetch.slice(0, MAX_BATCH_SIZE);
        batch.forEach((id) => fetchedIdsRef.current.add(id));

        const fetchPromises = batch.map((userId) =>
          githubUsernameCache.fetchUsername(userId).then((username: string | null) => ({ userId, username }))
        );

        const results = await Promise.all(fetchPromises);
        results.forEach(({ userId, username }) => {
          if (username) cachedUsernames.set(userId, username);
        });

        setUsernames((prev) => {
          const merged = new Map(prev);
          cachedUsernames.forEach((username, id) => merged.set(id, username));
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

