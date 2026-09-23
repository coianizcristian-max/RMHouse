import { redirect } from 'next/navigation';

// Le impostazioni ora stanno dentro le rispettive aree:
// questa pagina resta solo per i vecchi link.
export default function Impostazioni() {
  redirect('/gestione/indice');
}
