-- 167 — Gli abbonamenti "a mese" (mensili, trimestrali…) scadono tutti a fine mese solare
-- Due tipi in listino ("ATTREZZI 60 min 2 volte Mensile", "TAI CHI O SHAOLIN 2 lez Mensile") erano rimasti con
-- "Scade a fine mese solare" spento e durata 28 giorni (come nella vecchia app): così dall'area clienti si poteva
-- partire da un giorno qualsiasi e avere 28 giorni a prezzo pieno (dal 14/10 al 10/11), e allo Sportello non
-- usciva la proposta "metà mese". Qui si accende il flag a tutti i tipi attivi che durano almeno 28 giorni
-- (non i pacchetti a ingressi, non la lezione singola). Gli abbonamenti già fatti non cambiano. Si può rilanciare.

update tipi_abbonamento
   set scadenza_fine_mese = true
 where modalita <> 'ingressi'
   and attivo and not archiviato
   and not scadenza_fine_mese
   and (durata_giorni is null or durata_giorni >= 28);

notify pgrst, 'reload schema';
