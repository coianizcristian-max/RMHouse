-- =====================================================================
-- RMHouse — 030 I COLORI DI APP PALESTRE
--
-- Ogni corso riprende il colore che aveva in APP Palestre (barra laterale
-- nell'elenco corsi e intestazione delle schede nel palinsesto), segnato
-- come "scelto a mano": nessun ricalcolo automatico lo tocca più, tranne
-- il pulsante "Rigenera tutti" del palinsesto, che lo chiede prima.
--
-- In più:
--  - la TAVOLOZZA della scuola (15 colori) viene salvata nelle impostazioni
--    e compare nel modulo del corso come prima scelta;
--  - ogni disciplina prende il colore più usato dai suoi corsi, così anche
--    le gradazioni proposte partono da lì e non più da rosso e grigio.
-- Si può eseguire più volte.
-- =====================================================================

do $$
declare p palestre; n int; v_mancanti text;
begin
  select * into p from palestre where slug = 'rmhouse';
  if not found then raise exception 'Palestra rmhouse non trovata'; end if;

  create temp table _colori (corso text, colore text) on commit drop;
  insert into _colori values
    ('Acrodance / Acrobatica', '#ff0000'),
    ('Aerea adulti 1', '#00bfff'),
    ('Aerea adulti 2', '#00bfff'),
    ('Aerea adulti 3', '#00bfff'),
    ('Aerea Agonismo', '#00bfff'),
    ('Aerea Performance Team', '#ff0000'),
    ('Aerea Cerchio', '#00ffff'),
    ('Aerea Cerchio 2', '#00ffff'),
    ('Aerial Fusion', '#ff0000'),
    ('Aerea Kids 1', '#00bfff'),
    ('Aerea Kids 2', '#00bfff'),
    ('Aerea Mini 5-6', '#00ffff'),
    ('Aerea Teen 1', '#00bfff'),
    ('Aerea Teen 2', '#00bfff'),
    ('Aerea Teen 3', '#00bfff'),
    ('Aerea 1 Schio', '#ff00ff'),
    ('Aerea 2 Schio', '#ff0000'),
    ('Aerea Young 1 Schio', '#ff0000'),
    ('Aerea Kids Bolzano Vicentino', '#00ffff'),
    ('Aerea Teen Bolzano Vicentino', '#00f5c8'),
    ('Antigravity® Liv.1', '#ffc800'),
    ('Antigravity® Liv.2', '#ffc800'),
    ('Antigravity 3', '#ff8c00'),
    ('Antigravity® Pausa Pranzo', '#ffc800'),
    ('Antigravity Restorative', '#ff0000'),
    ('Antigravity Bolzano Vicentino', '#ffc800'),
    ('Pole Dance Liv.1', '#ff00ff'),
    ('Pole Dance Liv.2', '#ff00ff'),
    ('Pole Dance Liv.3', '#ff00ff'),
    ('Exotic Pole Open Level', '#ff00ff'),
    ('Pole Young 1', '#ff99cc'),
    ('Pole Young 2', '#ff99cc'),
    ('Open Training', '#ff0000'),
    ('Hip Hop adulti', '#ff0000'),
    ('Hip Hop 2', '#ff0000'),
    ('Hip Hop Open Class', '#ff4500'),
    ('Hip Hop Teen', '#ff0000'),
    ('Hip Hop Kids', '#ffff00'),
    ('Hip Hop Mini 5-6 anni', '#ff0000'),
    ('Heels', '#ff0000'),
    ('Heels liv. 2', '#ff0000'),
    ('Breakdance 1', '#ff0000'),
    ('Breakdance 2', '#ff0000'),
    ('Afro', '#ff0000'),
    ('K Pop', '#ff0000'),
    ('Burlesque Liv.1', '#ff0000'),
    ('Burlesque Liv.2', '#ff0000'),
    ('Danza classica amatoriale', '#ff0000'),
    ('Danza classica young', '#ff0000'),
    ('Danza contemporanea amatoriale', '#ff0000'),
    ('Danza moderna', '#ff0000'),
    ('Country Dance', '#ff0000'),
    ('Hustle Dance', '#ff0000'),
    ('Zumba', '#2200ff'),
    ('Pilates', '#ffff00'),
    ('Yoga', '#9acd32'),
    ('Ginnastica posturale', '#ff0000'),
    ('Flexy', '#008080'),
    ('Tai Chi', '#008000'),
    ('Shaolin Kung Fu 1', '#008000'),
    ('Shaolin Kung Fu 2', '#008000'),
    ('Lezione privata', '#8a2be2');

  select string_agg(corso, ', ') into v_mancanti from _colori c
   where not exists (select 1 from corsi x where x.palestra_id = p.id and x.nome = c.corso);
  if v_mancanti is not null then raise notice 'Corsi non trovati (saltati): %', v_mancanti; end if;

  -- 1. tavolozza della scuola
  update palestre
     set tema = coalesce(tema, '{}'::jsonb) || jsonb_build_object('tavolozza', jsonb_build_array(jsonb_build_object('nome', 'Rosso', 'colore', '#ff0000'), jsonb_build_object('nome', 'Verde', 'colore', '#008000'), jsonb_build_object('nome', 'Giallo', 'colore', '#ffff00'), jsonb_build_object('nome', 'Azzurro', 'colore', '#00bfff'), jsonb_build_object('nome', 'Ciano', 'colore', '#00ffff'), jsonb_build_object('nome', 'Acquamarina', 'colore', '#00f5c8'), jsonb_build_object('nome', 'Oro', 'colore', '#ffc800'), jsonb_build_object('nome', 'Arancio', 'colore', '#ff8c00'), jsonb_build_object('nome', 'Rosso arancio', 'colore', '#ff4500'), jsonb_build_object('nome', 'Magenta', 'colore', '#ff00ff'), jsonb_build_object('nome', 'Rosa', 'colore', '#ff99cc'), jsonb_build_object('nome', 'Verde petrolio', 'colore', '#008080'), jsonb_build_object('nome', 'Lime', 'colore', '#9acd32'), jsonb_build_object('nome', 'Blu elettrico', 'colore', '#2200ff'), jsonb_build_object('nome', 'Viola', 'colore', '#8a2be2')))
   where id = p.id;

  -- 2. colore di ogni corso, scelto a mano
  update corsi x set colore = c.colore, colore_automatico = false
    from _colori c where x.palestra_id = p.id and x.nome = c.corso;
  get diagnostics n = row_count;

  -- 3. ogni disciplina prende il colore più usato dai suoi corsi
  update discipline d set colore = t.colore
    from (select distinct on (disciplina_id) disciplina_id, colore
            from corsi where palestra_id = p.id and colore is not null
           group by disciplina_id, colore
           order by disciplina_id, count(*) desc, colore) t
   where d.id = t.disciplina_id;

  raise notice 'Colori assegnati a % corsi.', n;
end $$;

-- Controllo: corsi per colore
select colore, count(*) as corsi, string_agg(nome, ', ' order by nome) as quali
from corsi where palestra_id = (select id from palestre where slug = 'rmhouse')
group by colore order by count(*) desc;
