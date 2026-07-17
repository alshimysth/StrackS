import { Redirect } from 'expo-router';
import React from 'react';

import { useAuthStore } from '../core/auth/use-auth-store';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  return <Redirect href={token ? '/(tabs)' : '/(auth)/login'} />;
}
