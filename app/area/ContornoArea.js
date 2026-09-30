'use client';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Testata from '../Testata';
import MenuArea from './MenuArea';

// Testata e menù dell'area clienti, tranne che nella pagina di accesso (che ha la sua impaginazione)
export default function ContornoArea({ children }) {
  const path = usePathname();
  const router = useRouter();
  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/area/accedi');
    router.refresh();
  }
  if (path.startsWith('/area/accedi')) return children;
  return (
    <>
      <Testata destra={<button type="button" className="testata-link" onClick={esci}>Esci</button>} />
      <MenuArea />
      <main className="pagina">{children}</main>
    </>
  );
}
