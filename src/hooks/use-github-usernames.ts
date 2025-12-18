import { useEffect, useMemo, useRef, useState } from "react";
import type { PermitData } from "../types.ts";
import { githubUsernameCache } from "../utils/github-cache.ts";

/**
 * Hook to fetch GitHub usernames for permits.
 * Manages fetching and caching of GitHub usernames to avoid rate limits.
 */
export function useGithubUsernames(permits: PermitData[]) {
  const [usernames, setUsernames] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const usernamesRef = useRef(usernames);
  const retryStateRef = useRef(new Map<number, { attempt: number; nextAttemptAtMs: number }>());
  const exhaustedUserIdsRef = useRef(new Set<number>());

  useEffect(() => {
    usernamesRef.current = usernames;
  }, [usernames]);

  const beneficiaryUserIdsKey = useMemo(() => {
    const ids = new Set<number>();
    for (const permit of permits) {
      if (typeof permit.beneficiaryUserId === "number" && permit.beneficiaryUserId > 0) {
        ids.add(permit.beneficiaryUserId);
      }
    }
    return Array.from(ids)
      .sort((a, b) => a - b)
      .join(",");
  }, [permits]);

  useEffect(() => {
    if (!beneficiaryUserIdsKey) {
      setIsLoading(false);
      return;
    }

    const BATCH_SIZE = 10;
    const CONCURRENCY = 4;
    const BASE_RETRY_DELAY_MS = 30_000;
    const MAX_RETRY_DELAY_MS = 10 * 60_000;
    const MAX_ATTEMPTS = 5;

    const beneficiaryUserIds = beneficiaryUserIdsKey
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const abortController = new AbortController();
    const { signal } = abortController;
    let cancelled = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeoutId);
            resolve();
          },
          { once: true }
        );
      });

    const scheduleRetry = (userId: number) => {
      const prev = retryStateRef.current.get(userId)?.attempt ?? 0;
      const attempt = prev + 1;
      if (attempt >= MAX_ATTEMPTS) {
        retryStateRef.current.delete(userId);
        exhaustedUserIdsRef.current.add(userId);
        return;
      }
      const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.min(attempt - 1, 6), MAX_RETRY_DELAY_MS);
      retryStateRef.current.set(userId, { attempt, nextAttemptAtMs: Date.now() + delay });
    };

    const fetchBatch = async (userIds: number[]): Promise<Map<number, string>> => {
      const fetched = new Map<number, string>();
      let stoppedByRateLimit = false;
      let index = 0;

      const workers = Array.from({ length: Math.min(CONCURRENCY, userIds.length) }, async () => {
        while (!cancelled && !stoppedByRateLimit) {
          const currentIndex = index;
          index += 1;
          if (currentIndex >= userIds.length) return;

          const userId = userIds[currentIndex];

          if (githubUsernameCache.isRateLimited()) {
            stoppedByRateLimit = true;
            return;
          }

          const username = await githubUsernameCache.fetchUsername(userId);
          if (cancelled) return;

          if (username) {
            fetched.set(userId, username);
            retryStateRef.current.delete(userId);
            continue;
          }

          if (githubUsernameCache.isNotFound(String(userId))) {
            retryStateRef.current.delete(userId);
            continue;
          }

          if (githubUsernameCache.isRateLimited()) {
            stoppedByRateLimit = true;
            return;
          }

          scheduleRetry(userId);
        }
      });

      await Promise.all(workers);
      return fetched;
    };

    const run = async () => {
      setIsLoading(true);
      try {
        const activeUserIdSet = new Set(beneficiaryUserIds);
        retryStateRef.current.forEach((_value, id) => {
          if (!activeUserIdSet.has(id)) retryStateRef.current.delete(id);
        });
        exhaustedUserIdsRef.current.forEach((id) => {
          if (!activeUserIdSet.has(id)) exhaustedUserIdsRef.current.delete(id);
        });

        const cachedUsernames = new Map<number, string>();
        for (const id of beneficiaryUserIds) {
          const cached = githubUsernameCache.get(String(id));
          if (cached) cachedUsernames.set(id, cached);
        }

        if (!cancelled && cachedUsernames.size > 0) {
          setUsernames((prev) => {
            const merged = new Map(prev);
            cachedUsernames.forEach((username, id) => merged.set(id, username));
            return merged;
          });
        }

        while (!cancelled) {
          if (githubUsernameCache.isRateLimited()) {
            const { resetAtMs } = githubUsernameCache.getRateLimit();
            if (resetAtMs == null) return;
            const delayMs = Math.max(0, resetAtMs - Date.now()) + 1000;
            await sleep(delayMs);
            continue;
          }

          const now = Date.now();
          const unresolvedUserIds = beneficiaryUserIds.filter((id) => {
            if (usernamesRef.current.has(id)) return false;
            if (githubUsernameCache.get(String(id))) return false;
            if (githubUsernameCache.isNotFound(String(id))) return false;
            if (exhaustedUserIdsRef.current.has(id)) return false;
            return true;
          });

          if (unresolvedUserIds.length === 0) return;

          const eligibleUserIds = unresolvedUserIds.filter((id) => {
            const nextAtMs = retryStateRef.current.get(id)?.nextAttemptAtMs ?? 0;
            return nextAtMs <= now;
          });

          if (eligibleUserIds.length === 0) {
            const nextAttemptAtMs = Math.min(...unresolvedUserIds.map((id) => retryStateRef.current.get(id)?.nextAttemptAtMs ?? now + 60_000));
            await sleep(Math.max(1000, nextAttemptAtMs - now));
            continue;
          }

          const remaining = githubUsernameCache.getRateLimit().remaining;
          const maxBatchSize = remaining == null ? BATCH_SIZE : Math.max(0, Math.min(BATCH_SIZE, remaining));

          if (maxBatchSize === 0) {
            const { resetAtMs } = githubUsernameCache.getRateLimit();
            if (resetAtMs == null) return;
            const delayMs = Math.max(0, resetAtMs - Date.now()) + 1000;
            await sleep(delayMs);
            continue;
          }

          const batch = eligibleUserIds.slice(0, maxBatchSize);
          const fetched = await fetchBatch(batch);
          if (cancelled) return;

          if (fetched.size > 0) {
            setUsernames((prev) => {
              const merged = new Map(prev);
              fetched.forEach((username, id) => merged.set(id, username));
              return merged;
            });
          }
        }
      } catch (error) {
        console.error("Error fetching GitHub usernames:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [beneficiaryUserIdsKey]);

  return { usernames, isLoading };
}
