'use client';

import { SupabaseProvider } from '@/components/SupabaseProvider';

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <SupabaseProvider>{children}</SupabaseProvider>;
}
