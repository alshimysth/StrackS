/**
 * Écrans de sécurité du compte (#73, #75). Réservés à une session ouverte : une
 * déconnexion (ou un renouvellement refusé) pendant qu'on y est renvoie à la connexion.
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
