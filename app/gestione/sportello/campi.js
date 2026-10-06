'use client';
import { useEffect, useState } from 'react';

// Piccoli aiuti condivisi dallo Sportello (stessi comportamenti del modulo "Nuovo cliente")
export const maiuscole = (s) => s.trim().toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const soloCifre = (s) => String(s || '').replace(/\D/g, '');
export const centDa = (s) => { const n = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : null; };
export const euroTesto = (cent) => (cent == null ? '' : (cent / 100).toFixed(2).replace('.', ',').replace(',00', ''));
export const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
export const piuGiorni = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const giorniTra = (da, a) => Math.round((new Date(a + 'T12:00:00Z') - new Date(da + 'T12:00:00Z')) / 86400000);

// "12052015" → "12/05/2015"; accetta anche 12-5-2015, 12.5.15
export function formattaData(v) {
  const c = soloCifre(v).slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}
export function dataISO(v, futura = false) {
  const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, g, mm, a] = m;
  if (a.length === 2) a = futura ? '20' + a : (Number(a) > new Date().getFullYear() % 100 ? '19' : '20') + a;
  const d = new Date(`${a}-${mm.padStart(2, '0')}-${g.padStart(2, '0')}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(g)) return null;
  return `${a}-${mm.padStart(2, '0')}-${g.padStart(2, '0')}`;
}
export const daISO = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
export const eta = (iso) => {
  if (!iso) return null;
  const n = new Date(iso), o = new Date();
  return o.getFullYear() - n.getFullYear() - (o < new Date(o.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
};

// Data scritta a mano (si può scrivere anche 12052015). futura: "30/9/27" vuol dire 2027
export function Data({ id, valore, onChange, etichetta, futura = false, mostraEta = false }) {
  const [testo, setTesto] = useState(daISO(valore));
  // si riallinea solo se la data cambia da fuori: mentre si scrive "011019" non deve diventare 01/10/2019
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if ((valore || '') !== (dataISO(testo, futura) || '')) setTesto(daISO(valore)); }, [valore]);
  const iso = dataISO(testo, futura);
  const anni = eta(iso);
  return (
    <div className="campo">
      <label htmlFor={id}>{etichetta}
        {testo && !iso ? <span className="eti-info errore-testo"> · non valida</span>
          : mostraEta && anni != null ? <span className="eti-info"> · {anni} anni</span> : null}
      </label>
      <input id={id} inputMode="numeric" placeholder="gg/mm/aaaa" title="Si può scrivere anche 12052015" value={testo} autoComplete="off"
             onChange={(e) => { const t = formattaData(e.target.value); setTesto(t); onChange(dataISO(t, futura) || ''); }} />
    </div>
  );
}

// copia negli appunti (con un piccolo "copiato ✓")
export function useCopia() {
  const [copiato, setCopiato] = useState('');
  const copia = async (testo, chiave = testo) => {
    try { await navigator.clipboard.writeText(testo); } catch {
      const t = document.createElement('textarea'); t.value = testo; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { /* niente */ } t.remove();
    }
    setCopiato(chiave); setTimeout(() => setCopiato(''), 1600);
  };
  return [copiato, copia];
}

export const whatsappLink = (tel, testo = '') => {
  const n = soloCifre(String(tel || '').replace(/^\+/, ''));
  if (!n) return null;
  const numero = n.length <= 10 ? '39' + n : n;
  return `https://wa.me/${numero}${testo ? `?text=${encodeURIComponent(testo)}` : ''}`;
};
