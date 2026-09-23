'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const VUOTO = {
  nome: '', cognome: '', email: '', telefono: '', codice_fiscale: '',
  indirizzo: '', cap: '', citta: '', provincia: '', data_nascita: '',
  frequenta_lui: true,
  a_nome: '', a_cognome: '', a_data_nascita: '', certificato_scadenza: '',
  consenso_privacy: false, consenso_marketing: false, note: '',
};

const MOTIVI = {
  nome_mancante: 'Serve almeno il nome del titolare.',
  email_non_valida: "Controlla l'indirizzo email.",
  data_nascita_mancante: 'Serve la data di nascita di chi frequenta.',
};

// Registrazione al banco: chi paga e chi frequenta, in un colpo solo
export default function NuovaPersona({ palestraId }) {
  const router = useRouter();
  const [f, setF] = useState(VUOTO);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function salva(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('crea_persona', {
      p: {
        palestra_id: palestraId,
        titolare: {
          nome: f.nome, cognome: f.cognome, email: f.email, telefono: f.telefono,
          codice_fiscale: f.codice_fiscale, indirizzo: f.indirizzo, cap: f.cap,
          citta: f.citta, provincia: f.provincia, data_nascita: f.data_nascita,
        },
        allievo: f.frequenta_lui ? {} : { nome: f.a_nome, cognome: f.a_cognome, data_nascita: f.a_data_nascita },
        certificato_scadenza: f.certificato_scadenza,
        consenso_privacy: f.consenso_privacy,
        consenso_marketing: f.consenso_marketing,
        note: f.note,
        fonte: 'segreteria',
      },
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(MOTIVI).find((m) => error.message?.includes(m));
      setErrore(k ? MOTIVI[k] : 'Salvataggio non riuscito.');
      return;
    }
    // si prosegue nella scheda, dove si crea l'iscrizione al corso
    router.push(`/gestione/persone/${data.allievo_id}?nuovo=1`);
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Nuova persona</h1>
        <p>Registra chi paga e chi frequenta. Subito dopo potrai creare l'iscrizione al corso.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <form onSubmit={salva}>
        <h3>Chi paga</h3>
        <div className="campo"><label htmlFor="n">Nome</label><input id="n" value={f.nome} onChange={set('nome')} autoFocus /></div>
        <div className="campo"><label htmlFor="c">Cognome</label><input id="c" value={f.cognome} onChange={set('cognome')} /></div>
        <div className="campo">
          <label htmlFor="e">Email</label>
          <input id="e" type="email" value={f.email} onChange={set('email')} />
          <span className="piccolo muto">Se esiste già, l'allievo viene aggiunto a quella famiglia.</span>
        </div>
        <div className="campo"><label htmlFor="t">Telefono</label><input id="t" type="tel" value={f.telefono} onChange={set('telefono')} /></div>
        <div className="campo"><label htmlFor="cf">Codice fiscale</label><input id="cf" value={f.codice_fiscale} onChange={set('codice_fiscale')} /></div>
        <div className="campo"><label htmlFor="in">Indirizzo</label><input id="in" value={f.indirizzo} onChange={set('indirizzo')} /></div>
        <div className="campo"><label htmlFor="ci">Città</label><input id="ci" value={f.citta} onChange={set('citta')} /></div>
        <div className="riga-2">
          <div className="campo"><label htmlFor="ca">CAP</label><input id="ca" value={f.cap} onChange={set('cap')} /></div>
          <div className="campo"><label htmlFor="pr">Provincia</label><input id="pr" value={f.provincia} onChange={set('provincia')} /></div>
        </div>

        <h3>Chi frequenta</h3>
        <label className="spunta">
          <input type="checkbox" checked={f.frequenta_lui} onChange={set('frequenta_lui')} />
          <span>Frequenta la stessa persona che paga</span>
        </label>

        {f.frequenta_lui ? (
          <div className="campo">
            <label htmlFor="dn">Data di nascita</label>
            <input id="dn" type="date" value={f.data_nascita} onChange={set('data_nascita')} />
            <span className="piccolo muto">Serve per la fascia d'età e per il certificato.</span>
          </div>
        ) : (
          <>
            <div className="campo"><label htmlFor="an">Nome</label><input id="an" value={f.a_nome} onChange={set('a_nome')} /></div>
            <div className="campo"><label htmlFor="ac">Cognome</label><input id="ac" value={f.a_cognome} onChange={set('a_cognome')} /></div>
            <div className="campo"><label htmlFor="ad">Data di nascita</label><input id="ad" type="date" value={f.a_data_nascita} onChange={set('a_data_nascita')} /></div>
          </>
        )}

        <div className="campo">
          <label htmlFor="ce">Scadenza del certificato medico</label>
          <input id="ce" type="date" value={f.certificato_scadenza} onChange={set('certificato_scadenza')} />
          <span className="piccolo muto">Lascia vuoto se non l'ha ancora consegnato.</span>
        </div>

        <div className="campo"><label htmlFor="no">Note</label><textarea id="no" value={f.note} onChange={set('note')} /></div>

        <h3>Consensi</h3>
        <label className="spunta">
          <input type="checkbox" checked={f.consenso_privacy} onChange={set('consenso_privacy')} />
          <span>Ha firmato l'informativa privacy</span>
        </label>
        <label className="spunta">
          <input type="checkbox" checked={f.consenso_marketing} onChange={set('consenso_marketing')} />
          <span>Accetta comunicazioni promozionali</span>
        </label>

        <div className="azioni">
          <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Crea e prosegui'}</button>
        </div>
      </form>
    </>
  );
}
