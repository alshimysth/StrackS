/**
 * Account security screens (#73, #75). Reserved for an open session: a logout (or a
 * refused refresh) while on them sends back to login.
 */
import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useAuthStore } from '../../core/auth/use-auth-store';

export default function AccountLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
