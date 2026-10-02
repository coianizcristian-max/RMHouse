// La fattura elettronica (FatturaPA 1.2, formato FPR12 per i privati) di una fattura emessa da RMHouse.
// Il file si carica gratis sul portale "Fatture e Corrispettivi" dell'Agenzia delle Entrate,
// oppure si gira al commercialista. Una sola riga: l'incasso, con IVA scorporata.

const x = (s) => String(s ?? '')
  .normalize('NFC')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/[^\x20-\x7E -ÿ]/g, ' ')   // caratteri accettati dallo SdI (latino base)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  .trim();
const taglia = (s, n) => x(String(s ?? '').slice(0, n));
const e2 = (cent) => (Math.round(cent) / 100).toFixed(2);
const tag = (nome, valore) => (valore == null || valore === '' ? '' : `<${nome}>${valore}</${nome}>`);

const MODALITA = { contanti: 'MP01', assegno: 'MP02', bonifico: 'MP05', pos: 'MP08', online: 'MP08', stripe: 'MP08' };

// progressivo d'invio: 5 caratteri, unico per chi trasmette.
// Fatture: anno + numero in base 36 (es. 26001). Note di credito: "N" + anno + numero in base 36 (es. N2601).
export function progressivo(r) {
  const aa = String(r.anno % 100).padStart(2, '0');
  return r.tipo_documento === 'nota_credito'
    ? `N${aa}${r.numero.toString(36).toUpperCase().padStart(2, '0')}`
    : `${aa}${r.numero.toString(36).toUpperCase().padStart(3, '0')}`;
}
export function nomeFile(scuola, r) {
  return `IT${scuola.piva}_${progressivo(r)}.xml`;
}

// collegata: per la nota di credito, la fattura stornata { numero: 'FT1/2026', data: '2026-10-02' }
export function fatturaXml(r, scuola, codiceNumerazione = 'FT', collegata = null) {
  const nota = r.tipo_documento === 'nota_credito';
  const c = r.cliente || {};
  const naz = (c.nazione || 'IT').toUpperCase();
  const totale = r.importo_cent + r.iva_cent;
  const perc = r.iva_cent > 0 ? ((r.iva_cent / r.importo_cent) * 100) : 0;
  // la percentuale vera viene dall'aliquota (22, 10…): si arrotonda alla più vicina "tonda"
  const aliquota = r.aliquote_iva?.percentuale != null ? Number(r.aliquote_iva.percentuale) : Math.round(perc);
  const natura = aliquota === 0 ? (r.natura || r.aliquote_iva?.natura || 'N2.2') : null;
  const pec = c.codice_destinatario === '0000000' && c.pec ? c.pec : null;

  const cessionarioAnagrafica = c.tipo === 'azienda'
    ? `<Denominazione>${taglia(c.denominazione, 80)}</Denominazione>`
    : `<Nome>${taglia(c.nome, 60)}</Nome><Cognome>${taglia(c.cognome, 60)}</Cognome>`;
  const cessionarioId = [
    c.piva ? `<IdFiscaleIVA><IdPaese>${naz}</IdPaese><IdCodice>${x(c.piva)}</IdCodice></IdFiscaleIVA>` : '',
    c.cf && naz === 'IT' ? `<CodiceFiscale>${x(c.cf)}</CodiceFiscale>` : '',
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${x(scuola.cf || scuola.piva)}</IdCodice></IdTrasmittente>
      <ProgressivoInvio>${progressivo(r)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${x(c.codice_destinatario || '0000000')}</CodiceDestinatario>
      ${tag('PECDestinatario', pec ? taglia(pec, 256) : null)}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${x(scuola.piva)}</IdCodice></IdFiscaleIVA>
        ${tag('CodiceFiscale', scuola.cf ? x(scuola.cf) : null)}
        <Anagrafica><Denominazione>${taglia(scuola.denominazione, 80)}</Denominazione></Anagrafica>
        <RegimeFiscale>${x(scuola.regime || 'RF18')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${taglia(scuola.indirizzo, 60)}</Indirizzo>
        <CAP>${x(scuola.cap)}</CAP>
        <Comune>${taglia(scuola.comune, 60)}</Comune>
        ${tag('Provincia', scuola.provincia ? x(String(scuola.provincia).toUpperCase()) : null)}
        <Nazione>IT</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${cessionarioId}
        <Anagrafica>${cessionarioAnagrafica}</Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${taglia(c.indirizzo, 60)}</Indirizzo>
        <CAP>${naz === 'IT' ? x(c.cap) : '00000'}</CAP>
        <Comune>${taglia(c.comune, 60)}</Comune>
        ${tag('Provincia', naz === 'IT' && /^[A-Z]{2}$/.test(c.provincia || '') ? c.provincia : null)}
        <Nazione>${naz}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${nota ? 'TD04' : 'TD01'}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${r.data}</Data>
        <Numero>${x(`${codiceNumerazione}${r.numero}/${r.anno}`)}</Numero>
        ${r.bollo_cent > 0 ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${e2(r.bollo_cent)}</ImportoBollo></DatiBollo>` : ''}
        <ImportoTotaleDocumento>${e2(totale)}</ImportoTotaleDocumento>
        ${r.note ? `<Causale>${taglia(r.note, 200)}</Causale>` : ''}
      </DatiGeneraliDocumento>
      ${nota && collegata ? `<DatiFattureCollegate><IdDocumento>${x(collegata.numero)}</IdDocumento><Data>${collegata.data}</Data></DatiFattureCollegate>` : ''}
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>${taglia(r.descrizione, 1000)}</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${e2(r.importo_cent)}</PrezzoUnitario>
        <PrezzoTotale>${e2(r.importo_cent)}</PrezzoTotale>
        <AliquotaIVA>${aliquota.toFixed(2)}</AliquotaIVA>
        ${tag('Natura', natura)}
      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>${aliquota.toFixed(2)}</AliquotaIVA>
        ${tag('Natura', natura)}
        <ImponibileImporto>${e2(r.importo_cent)}</ImponibileImporto>
        <Imposta>${e2(r.iva_cent)}</Imposta>
        ${natura ? '' : '<EsigibilitaIVA>I</EsigibilitaIVA>'}
        ${natura && r.aliquote_iva?.riferimento ? `<RiferimentoNormativo>${taglia(r.aliquote_iva.riferimento, 100)}</RiferimentoNormativo>` : ''}
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${MODALITA[r.metodo] || 'MP01'}</ModalitaPagamento>
        <ImportoPagamento>${e2(totale)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`.replace(/\n\s*\n/g, '\n');
}
