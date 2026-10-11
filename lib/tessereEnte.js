// Tessere dell'ente (ASI): valori predefiniti, scelte del portale ASI e il file per il "Caricamento tessere da file".
// Le impostazioni stanno in palestre.ente (jsonb), i valori di una singola persona in allievi.tessera_* (query 157).

// le scelte che si vedono sul portale ASI (Tesserati → Inserimento nuovo tesserato)
export const TIPI_ASI = ['A', 'B', 'C', 'C1', 'C1_AUTO', 'Calcio Tornei', 'K', 'KM', 'Licenza Karting', 'LKM', 'M', 'MA', 'MT', 'Socio',
  'Tessera Calcio', 'TRIAL', 'TRIAL_CARD', 'Volontario', 'Volontario Sport'];
export const QUALIFICHE_ASI = ['Atleta', 'Dirigente', 'Socio', 'Tecnico', 'Utilizzatore', 'Volontario'];
// le discipline della vostra affiliazione (dal portale): si possono cambiare nelle impostazioni
export const DISCIPLINE_ASI = ["Attivita' sportiva ginnastica finalizzata alla salute ed al fitness", 'Danza Hip Hop', 'Danze Caraibiche',
  'Danze Coreografiche Freestyle', 'Ginnastica Acrobatica', 'Ginnastica per tutti', 'TAI CHI (YANG)'];

// cosa si può mettere in una colonna del file
export const CAMPI = [
  ['stagione', 'Stagione'], ['disciplina', 'Disciplina (per l\'ente)'], ['qualifica', 'Qualifica'], ['tipo', 'Tipo tessera'],
  ['nome', 'Nome'], ['cognome', 'Cognome'], ['codice_fiscale', 'Codice fiscale'], ['sesso', 'Sesso'],
  ['data_nascita', 'Data di nascita'], ['luogo_nascita', 'Luogo di nascita'],
  ['comune', 'Comune di residenza'], ['indirizzo', 'Indirizzo di residenza'], ['cap', 'CAP'], ['provincia', 'Provincia'],
  ['email', 'Email'], ['telefono', 'Telefono'],
  ['numero', 'Numero tessera di questa stagione'], ['numero_precedente', 'Numero dell\'ultima tessera'],
  ['certificato', 'Scadenza del certificato medico'], ['affiliazione', 'Codice di affiliazione'], ['corsi', 'Corsi'],
  ['fisso', 'Un testo fisso…'], ['vuoto', '(vuota)'],
];

// il modello ASI "TEMPLATE_caricamentoTessere_CP.csv": 14 colonne separate da ";"
export const COLONNE_ASI = [
  ['STAGIONE', 'stagione'], ['DISCIPLINA', 'disciplina'], ['QUALIFICA', 'qualifica'], ['TIPO TESSERA', 'tipo'],
  ['NOME', 'nome'], ['COGNOME', 'cognome'], ['CODICE FISCALE', 'codice_fiscale'], ['COMUNE RESIDENZA', 'comune'],
  ['INDIRIZZO RESIDENZA', 'indirizzo'], ['CAP', 'cap'], ['EMAIL', 'email'], ['CODICE TESSERA', 'numero'],
  ['DATA SCADENZA CERTIFICATO', 'certificato'], ['CODICE AFFILIAZIONE', 'affiliazione'],
].map(([titolo, campo]) => ({ titolo, campo, valore: '' }));

export const FORMATI_STAGIONE = [['aaaa/aaaa', (a) => `${a}/${a + 1}`], ['aaaa-aaaa', (a) => `${a}-${a + 1}`], ['aaaa/aa', (a) => `${a}/${String(a + 1).slice(2)}`],
  ['aaaa', (a) => String(a)], ['aaaa+1', (a) => String(a + 1)]];
export const stagioneCome = (anno, formato = 'aaaa/aaaa') => (FORMATI_STAGIONE.find(([k]) => k === formato) || FORMATI_STAGIONE[0])[1](anno);

// le impostazioni con i valori predefiniti dove mancano
export function impostazioniEnte(ente = {}) {
  return {
    nome: '', affiliazione: '', portale: '', quota_comprende_tessera: false,
    tipo_tessera: 'A', qualifica: 'Atleta', disciplina: '', stagione_formato: 'aaaa/aaaa', validita: 'anno', codifica: 'utf8',
    ...ente,
    discipline_ente: Array.isArray(ente.discipline_ente) && ente.discipline_ente.length ? ente.discipline_ente : DISCIPLINE_ASI,
    mappa: ente.mappa && typeof ente.mappa === 'object' ? ente.mappa : {},
    colonne: Array.isArray(ente.colonne) && ente.colonne.length ? ente.colonne : COLONNE_ASI,
  };
}

// tipo, qualifica e disciplina di una persona: i suoi (se scelti), se no quelli dell'ultima tessera / del suo corso, se no i predefiniti
export function valoriPersona(r, ente) {
  const e = impostazioniEnte(ente);
  const daCorso = (r.discipline || []).map((id) => e.mappa[id]).find(Boolean);
  return {
    tipo: r.o_tipo || r.tipo_tessera || r.tipo_precedente || e.tipo_tessera || '',
    qualifica: r.o_qualifica || e.qualifica || '',
    disciplina: r.o_disciplina || daCorso || e.disciplina || '',
    // da dove viene (per spiegarlo a video)
    da: { tipo: r.o_tipo ? 'persona' : r.tipo_tessera || r.tipo_precedente ? 'tessera' : 'predefinito',
          qualifica: r.o_qualifica ? 'persona' : 'predefinito',
          disciplina: r.o_disciplina ? 'persona' : daCorso ? 'corso' : 'predefinito' },
  };
}

const data = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function valore(campo, r, v, e, stagione, fisso) {
  switch (campo) {
    case 'stagione': return stagioneCome(stagione, e.stagione_formato);
    case 'disciplina': return v.disciplina;
    case 'qualifica': return v.qualifica;
    case 'tipo': return v.tipo;
    case 'nome': case 'cognome': case 'sesso': case 'luogo_nascita': case 'indirizzo': case 'cap': case 'provincia':
    case 'email': case 'telefono': case 'corsi': return r[campo] || '';
    case 'codice_fiscale': return (r.codice_fiscale || '').toUpperCase();
    case 'data_nascita': return data(r.data_nascita);
    case 'comune': return r.citta || '';
    case 'numero': return r.numero || '';
    case 'numero_precedente': return r.numero_precedente || '';
    case 'certificato': return data(r.certificato);
    case 'affiliazione': return e.affiliazione || '';
    case 'fisso': return fisso || '';
    default: return '';
  }
}

// il testo del file: intestazione + una riga per persona, ";" come separatore, a capo semplice (come il modello ASI)
export function fileEnte(righe, ente, stagione) {
  const e = impostazioniEnte(ente);
  const pulito = (x) => String(x ?? '').replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const testa = e.colonne.map((c) => pulito(c.titolo)).join(';');
  const corpo = righe.map((r) => {
    const v = valoriPersona(r, e);
    return e.colonne.map((c) => pulito(valore(c.campo, r, v, e, stagione, c.valore))).join(';');
  });
  return [testa, ...corpo].join('\n') + '\n';
}

// scarica il file; "windows" = codifica dei programmi Windows (lettere accentate come nei vecchi Excel)
export function scaricaFileEnte(nome, testo, codifica = 'utf8') {
  let dati;
  if (codifica === 'windows') {
    const out = new Uint8Array(testo.length);
    let n = 0;
    for (const ch of testo) {
      const c = ch.codePointAt(0);
      const mappa = { 0x20ac: 0x80, 0x2019: 0x92, 0x2018: 0x91, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97 };
      out[n++] = c < 256 ? c : (mappa[c] || 0x3f);
    }
    dati = out.slice(0, n);
  } else dati = new TextEncoder().encode(testo);
  const url = URL.createObjectURL(new Blob([dati], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
