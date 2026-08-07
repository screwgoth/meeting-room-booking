import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/api'
import type { AvailabilityResponse, Facility, Floor, Office } from '@/api'
import { defaultFilters, type Filters } from './filters'

const TZ = 'Asia/Kolkata' // v1 single org display tz (D5); server echoes it in the response.

interface Meta {
  offices: Office[]
  floors: Floor[]
  facilities: Facility[]
}

interface State {
  filters: Filters
  meta: Meta
  data: AvailabilityResponse | null
  loading: boolean
  error: string | null
}

/** Owns the availability money-path state: filter values, the office/floor/facility
 * option lists, and the (re)fetched grid. Every filter change re-queries — no client
 * cache, matching the architecture's "live query, no stale free/busy" (NF4). */
export function useAvailability() {
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(TZ))
  const [meta, setMeta] = useState<Meta>({ offices: [], floors: [], facilities: [] })
  const [data, setData] = useState<State['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqSeq = useRef(0)

  // Bootstrap option lists; seed the office once (single site in v1, but modelled as
  // the first filter dimension so multi-office is additive — ARCHITECTURE §5a).
  useEffect(() => {
    let alive = true
    Promise.all([api.offices(), api.facilities()])
      .then(([offices, facilities]) => {
        if (!alive) return
        setMeta((m) => ({ ...m, offices, facilities }))
        if (offices[0]) setFilters((f) => (f.office == null ? { ...f, office: offices[0].id } : f))
      })
      .catch(() => alive && setError('Could not load rooms. Please retry.'))
    return () => {
      alive = false
    }
  }, [])

  // Floors follow the selected office.
  useEffect(() => {
    if (filters.office == null) return
    let alive = true
    api
      .floors(filters.office)
      .then((floors) => alive && setMeta((m) => ({ ...m, floors })))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [filters.office])

  const refetch = useCallback(async (f: Filters) => {
    if (f.office == null) return
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.availability({
        office: f.office,
        date: f.date,
        floor: f.floor ?? undefined,
        start: f.start,
        end: f.end,
        capacity: f.capacity > 1 ? f.capacity : undefined,
        facilities: f.facilities.length ? f.facilities : undefined,
      })
      if (seq === reqSeq.current) setData(res)
    } catch (e) {
      if (seq === reqSeq.current)
        setError(e instanceof ApiError ? e.detail : 'Could not load availability.')
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch(filters)
  }, [filters, refetch])

  return { filters, setFilters, meta, data, loading, error, tz: data?.timezone ?? TZ, refetch }
}
