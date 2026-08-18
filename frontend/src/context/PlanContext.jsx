import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const PlanContext = createContext(null);

// Loads the caller's own resolved plan/limits/usage once they're signed in
// as an employer or job seeker, and exposes small helpers the rest of the
// app uses to decide what to lock/show. Refetch after any action that could
// move usage past a limit (a verified call, a file upload, a job post) so
// the dashboard banner and sidebar lock icons update without a full reload.
export function PlanProvider({ children }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!user || (user.role !== 'employer' && user.role !== 'jobseeker')) {
      setPlan(null);
      setLoading(false);
      return Promise.resolve();
    }
    setLoading(true);
    return api.getMyPlan()
      .then(setPlan)
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [user?.id, user?.role]);

  useEffect(() => { refresh(); }, [refresh]);

  // limits[key] is either a boolean, a number, or 'unlimited' (serialized
  // server-side). isLocked treats an explicit `false` as locked (boolean
  // features), and also treats a numeric 0 as locked for number_or_unlimited
  // features (e.g. job_postings_monthly_limit, recruiter_sub_accounts_limit)
  // — across every plan's defaults, 0 always means "not included on this
  // plan" for those gate-style limits, same as `false` does for booleans.
  // A positive number or 'unlimited' is never locked, just capped.
  const isLocked = (featureKey) => {
    if (!plan?.limits) return false;
    const v = plan.limits[featureKey];
    return v === false || v === 0;
  };

  const pricingPath = user?.role === 'jobseeker' ? '/pricing/jobseeker' : '/pricing';

  return (
    <PlanContext.Provider value={{ plan, loading, refresh, isLocked, pricingPath }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}
