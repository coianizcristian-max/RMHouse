'use client';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function Esci() {
  const router = useRouter();
  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <p style={{ marginTop: 28 }}>
      <button className="btn" onClick={esci}>Esci dall'account</button>
    </p>
  );
}
