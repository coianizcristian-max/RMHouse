// Descrizione dei messaggi automatici: a cosa servono e quali segnaposto accettano
export const BASE = ['nome', 'palestra'];

export const EVENTI = {
  prova_confermata: {
    titolo: 'Conferma della prova',
    quando: 'Appena il cliente prenota (o appena paga, se la prova è a pagamento).',
    segnaposto: ['nome', 'nome_titolare', 'corso', 'disciplina', 'giorno', 'data', 'ora', 'sala', 'info_prova', 'palestra'],
  },
  promemoria_prova: {
    titolo: 'Promemoria della prova',
    quando: 'Il giorno prima della lezione, alle 18.',
    segnaposto: ['nome', 'nome_titolare', 'corso', 'disciplina', 'giorno', 'data', 'ora', 'sala', 'info_prova', 'palestra'],
    giorniEtichetta: 'Giorni di anticipo',
  },
  follow_up_prova: {
    titolo: 'Dopo la prova',
    quando: 'Due ore dopo la lezione, se la presenza è stata registrata.',
    segnaposto: ['nome', 'nome_titolare', 'corso', 'disciplina', 'palestra', 'link_abbonamento', 'link_recensione'],
  },
  sondaggio_perso: {
    titolo: 'Sondaggio "cosa non ti ha convinto"',
    quando: 'Qualche giorno dopo la prova, se la persona non si è iscritta.',
    segnaposto: ['nome', 'nome_titolare', 'corso', 'palestra', 'link_feedback', 'link_abbonamento'],
    giorniEtichetta: 'Giorni dopo la prova',
  },
  scadenza_abbonamento: {
    titolo: 'Abbonamento in scadenza',
    quando: 'Prima della scadenza, secondo i giorni impostati.',
    segnaposto: ['nome', 'corso', 'data', 'palestra'],
    giorniEtichetta: 'Giorni di anticipo',
  },
  scadenza_certificato: {
    titolo: 'Certificato medico',
    quando: 'Prima della scadenza. Con 0 giorni è il messaggio di blocco del giorno stesso.',
    segnaposto: ['nome', 'data', 'palestra', 'link_certificato'],
    giorniEtichetta: 'Giorni di anticipo (0 = il giorno della scadenza)',
    multiplo: true,
  },
  certificato_richiesto: {
    titolo: 'Richiesta del certificato',
    quando: "Alla nuova iscrizione, se manca un certificato valido.",
    segnaposto: ['nome', 'palestra', 'link_certificato'],
  },
  compleanno: {
    titolo: 'Compleanno',
    quando: 'Il giorno del compleanno, solo per chi ha un abbonamento attivo.',
    segnaposto: ['nome', 'palestra'],
  },
  posto_libero: {
    titolo: "Posto libero (lista d'attesa)",
    quando: 'Quando si libera un posto in una lezione con persone in coda.',
    segnaposto: ['corso', 'data', 'palestra', 'link_prenota'],
  },
  promo: {
    titolo: 'Promozione',
    quando: 'Solo quando la invii tu a un gruppo di iscritti.',
    segnaposto: ['nome', 'palestra'],
  },
};

export const ESEMPI = {
  nome: 'Sofia',
  nome_titolare: 'Laura',
  corso: 'Danza Aerea Kids Base',
  disciplina: 'Danza Aerea',
  giorno: 'mercoledì',
  data: '15/10/2026',
  ora: '17:00',
  sala: 'Sala Aerea',
  info_prova: 'Porta leggings e maglietta aderente, niente gioielli.',
  palestra: 'RM House',
  link_abbonamento: 'https://rmhouse.it/abbonamento?t=...',
  link_feedback: 'https://rmhouse.it/feedback?t=...',
  link_certificato: 'https://rmhouse.it/certificato?t=...',
  link_prenota: 'https://rmhouse.it/prova',
  link_recensione: 'https://g.page/rmhouse/review',
};

export const rendi = (testo) =>
  (testo || '').replace(/\{\{([a-z_]+)\}\}/g, (_, k) => ESEMPI[k] ?? '');
