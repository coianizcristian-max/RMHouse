import { redirect } from 'next/navigation';

// Le promozioni ora sono le Campagne, con pubblico e sondaggi
export default function Promo() {
  redirect('/gestione/crm/campagne');
}
