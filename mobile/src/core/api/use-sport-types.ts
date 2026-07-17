import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import type { SportTypeDescriptor } from '../../types/api';

/** Sports supportés par le backend — pilote l'UI de sélection (jamais de liste en dur). */
export function useSportTypes() {
  return useQuery({
    queryKey: ['sport-types'],
    queryFn: () => api<SportTypeDescriptor[]>('/api/v1/sport-types'),
  });
}
