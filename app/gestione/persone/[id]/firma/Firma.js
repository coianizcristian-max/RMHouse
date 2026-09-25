'use client';
import { useRouter } from 'next/navigation';
import FirmaModulo from '../../../../FirmaModulo';

export default function Firma({ modulo, allievo, minore, nome }) {
  const router = useRouter();
  return <FirmaModulo modulo={modulo} allievo={allievo} minore={minore} nomeSuggerito={nome}
                      onFatto={() => { router.push(`/gestione/persone/${allievo.id}`); router.refresh(); }} />;
}
