'use client';
import { useState } from 'react';
import CaricaCertificato from '../CaricaCertificato';

export default function Carica({ token, nome }) {
  const [fatto, setFatto] = useState(false);
  if (fatto) {
    return (
      <>
        <h1>Certificato ricevuto</h1>
        <p>La segreteria lo controlla e conferma la scadenza. Ti avviseremo un mese prima che scada.</p>
      </>
    );
  }
  return <CaricaCertificato token={token} nome={nome || 'chi frequenta'} onFatto={() => setFatto(true)} />;
}
