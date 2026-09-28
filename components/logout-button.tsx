'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function useLogout() {
  const router = useRouter()

  return async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }
}

export function LogoutButton() {
  const logout = useLogout()
  const t = useTranslations('auth.logout')

  return <Button onClick={logout}>{t('signOut')}</Button>
}
