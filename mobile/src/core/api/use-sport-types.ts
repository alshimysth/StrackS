import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import type { SportTypeDescriptor } from '../../types/api';

/** Sports supported by the backend; drives the selection UI (never a hard-coded list). */
export function useSportTypes() {
  return useQuery({
    queryKey: ['sport-types'],
    queryFn: () => api<SportTypeDescriptor[]>('/api/v1/sport-types'),
  });
}
