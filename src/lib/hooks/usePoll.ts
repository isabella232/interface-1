import ms from 'ms.macro'
import { useEffect, useMemo, useState } from 'react'

const DEFAULT_POLLING_INTERVAL = ms`15s`
const DEFAULT_KEEP_UNUSED_DATA_FOR = ms`10s`

export default function usePoll<T>(
  fetch: () => Promise<T>,
  key = '',
  check = false, // set to true to check the cache without initiating a new request
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  keepUnusedDataFor = DEFAULT_KEEP_UNUSED_DATA_FOR
): T | undefined {
  const cache = useMemo(() => new Map<string, { ttl: number; result?: T }>(), [])
  const [, setData] = useState<{ key: string; result?: T }>({ key })

  useEffect(() => {
    if (check) return

    let timeout: number

    const entry = cache.get(key)
    if (entry && entry.ttl + keepUnusedDataFor > Date.now()) {
      // If there is a fresh entry, return it and queue the next poll.
      setData({ key, result: entry.result })
      timeout = setTimeout(poll, Math.max(0, entry.ttl - Date.now()))
    } else {
      // Otherwise, set a new entry (to avoid duplicate polling) and trigger a poll immediately.
      cache.set(key, { ttl: Date.now() + pollingInterval })
      setData({ key })
      poll()
    }

    return () => {
      clearTimeout(timeout)
    }

    async function poll(ttl = Date.now() + pollingInterval) {
      timeout = setTimeout(poll, pollingInterval)
      const result = await fetch()
      // Always set the result in the cache, but only set it as data if the key is still being queried.
      cache.set(key, { ttl, result })
      setData((data) => {
        return data.key === key ? { key, result } : data
      })
    }
  }, [cache, check, fetch, keepUnusedDataFor, key, pollingInterval])

  useEffect(() => {
    // Cleanup stale entries when a new key is used.
    void key

    const now = Date.now()
    cache.forEach(({ ttl }, key) => {
      if (ttl + keepUnusedDataFor <= now) {
        cache.delete(key)
      }
    })
  }, [cache, keepUnusedDataFor, key])

  // Use data.result to force a re-render, but actually retrieve the data from the cache.
  // This gives the _first_ render access to a new result, avoiding lag introduced by React.
  return cache.get(key)?.result
}
