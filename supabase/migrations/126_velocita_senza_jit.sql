-- =====================================================================
-- RMHouse — 126 VELOCITÀ: SPEGNE IL "JIT" DI POSTGRES PER L'APP
--
-- Il JIT è una funzione di Postgres che, per le richieste che stima "pesanti", prima di eseguirle le compila.
-- Con le viste di RMHouse la stima è sempre alta, ma i dati sono pochi: la compilazione costa molto più
-- della richiesta stessa. Esempio misurato sulla copia dei dati veri:
--   cruscotto (pagina iniziale)  6,3 s → 0,23 s;  Persone 0,50 s → 0,11 s;  Da sistemare 0,48 s → 0,09 s.
-- Qui il JIT si spegne solo per gli utenti dell'app (segreteria, insegnanti, clienti, sito) e per le
-- funzioni più usate. Non cambia nessun dato. Si può eseguire più volte. Va dopo la 125.
-- =====================================================================

-- 1) per i ruoli con cui l'app parla al database (ogni richiesta lo applica da sola)
do $$
declare r text;
begin
  foreach r in array array['authenticated', 'anon', 'authenticator', 'service_role'] loop
    begin
      execute format('alter role %I set jit = off', r);
    exception when others then
      raise notice 'ruolo %: non modificabile qui (%), uso solo le funzioni sotto', r, sqlerrm;
    end;
  end loop;
end $$;

-- 2) sulle funzioni più pesanti: vale sempre, anche se il punto 1 non fosse permesso
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cruscotto', 'cruscotto_dati', 'possibili_doppioni', 'promemoria_miei',
                         'importa_ap_chiudi', 'importa_ap_anomalie', 'importa_app_palestre_storico',
                         'importa_app_palestre_clienti', 'importa_ap_prenotazioni', 'importa_ap_pagamenti')
  loop
    execute format('alter function %s set jit = off', f);
  end loop;
end $$;

-- 3) controllo: deve dire "off" per authenticated (se il punto 1 è andato)
select r.rolname as ruolo, coalesce((select s from unnest(r.rolconfig) s where s like 'jit=%'), 'jit predefinito') as impostazione
  from pg_roles r where r.rolname in ('authenticated', 'anon', 'authenticator', 'service_role') order by 1;
