'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function Attese({ id, stato }) {
  const router = useRouter();
  const [invio, setInvio] = useState(false);
  if (stato === 'chiuso') return null;

  async function chiudi() {
    setInvio(true);
    await supabaseBrowser().from('liste_attesa').update({ stato: 'chiuso' }).eq('id', id);
    setInvio(false);
    router.refresh();
  }
  return <button className="link-btn piccolo" disabled={invio} onClick={chiudi}>Togli dalla lista</button>;
}
