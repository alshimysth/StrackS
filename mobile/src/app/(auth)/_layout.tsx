import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useAuthStore } from '../../core/auth/use-auth-store';

export default function AuthLayout() {
  const token = useAuthStore((s) => s.token);
  if (token) {
    return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
