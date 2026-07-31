-- =============================================================================
-- Baseline data
--
-- Only configuration that is genuinely static lives here. Actual page content
-- (officers, sponsors, news, prose) is imported from the live website by
-- `npm run seed:content`, so the database starts as an exact mirror of what is
-- already published and the first publish produces an empty diff.
-- =============================================================================

-- --- The single settings row -------------------------------------------------
insert into public.settings (id) values (true)
on conflict (id) do nothing;

-- --- Holiday themes ----------------------------------------------------------
-- The colors below are starting points. Future officers can edit every value
-- from the Themes screen, and add entirely new themes, without touching code.
-- `normal` intentionally carries no overrides: selecting it emits an empty
-- theme.css so the site falls back to the hand-written style.css exactly.
insert into public.themes
  (key, name, is_builtin, primary_color, secondary_color, accent_color,
   background_color, text_color, banner_message, sort_order)
values
  ('normal',        'Normal (no theme)',  true, null,      null,      null,      null,      null,      null, 0),
  ('christmas',     'Christmas',          true, '#0f5132', '#b02a37', '#d4af37', '#f8f6f2', '#14261c', 'Happy Holidays from Club America!', 1),
  ('halloween',     'Halloween',          true, '#e2711d', '#2b1b3d', '#8bc34a', '#faf6f0', '#241a2e', null, 2),
  ('thanksgiving',  'Thanksgiving',       true, '#8c4a1e', '#c8952b', '#5c6b3c', '#fbf7ef', '#2e2115', null, 3),
  ('independence',  '4th of July',        true, '#0a3161', '#b31942', '#ffffff', '#f7f9fc', '#10203a', null, 4),
  ('new_years',     'New Years',          true, '#101828', '#d4af37', '#c0c7d1', '#f6f7f9', '#101828', 'Happy New Year!', 5),
  ('easter',        'Easter',             true, '#7cb9a8', '#f2b8c6', '#f7e59b', '#fdfbf7', '#33403c', null, 6),
  ('valentines',    'Valentines Day',     true, '#b02a5b', '#f2a0b5', '#ffd9e1', '#fff8fa', '#3a1521', null, 7),
  ('st_patricks',   'St Patricks Day',    true, '#12653a', '#f2c94c', '#8fd18a', '#f6fbf7', '#12291d', null, 8)
on conflict (key) do nothing;
