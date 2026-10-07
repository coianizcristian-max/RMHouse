'use client';
import ErroreCaricamento from './ErroreCaricamento';

// pagine pubbliche (sito, prova, ricevuta…): stesso comportamento della gestione
export default function Errore(props) {
  return <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}><ErroreCaricamento {...props} /></main>;
}
