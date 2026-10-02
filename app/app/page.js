import { redirect } from 'next/navigation';

// Indirizzo corto da dare ai clienti (WhatsApp, cartelli in sala): porta all'accesso dell'app
export default function App() {
  redirect('/area/accedi');
}
