import { gruppiInsegnanti } from '@/lib/competenze';

// Le <option> di una scelta dell'insegnante, a gruppi: prima chi tiene già il corso, poi chi insegna quella
// disciplina (scheda Staff → "Cosa insegna"), poi tutti gli altri. Si possono sempre scegliere tutti (es. sostituzioni).
const nome = (p) => `${p.nome} ${p.cognome || ''}`.trim();

export default function OpzioniInsegnanti({ persone, disciplinaId = null, nomeDisciplina = '', delCorso = [], competenze = [], discipline = [], dettaglio = null }) {
  const g = gruppiInsegnanti(persone, { disciplinaId, delCorso, competenze, discipline });
  const opz = (p) => <option key={p.id} value={p.id}>{nome(p)}{dettaglio ? dettaglio(p) : ''}</option>;
  if (!g.delCorso.length && !g.adatti.length) return <>{g.altri.map(opz)}</>;
  return (
    <>
      {g.delCorso.length > 0 && <optgroup label="Tengono il corso">{g.delCorso.map(opz)}</optgroup>}
      {g.adatti.length > 0 && <optgroup label={`Insegnano ${nomeDisciplina || 'questa disciplina'}`}>{g.adatti.map(opz)}</optgroup>}
      {g.altri.length > 0 && <optgroup label="Altri">{g.altri.map(opz)}</optgroup>}
    </>
  );
}
