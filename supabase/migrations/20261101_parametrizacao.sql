-- Parametrização (antiga Lista do dia): AWB da parametrização e dados de aduana por produto
alter table cortes add column if not exists awb text;
alter table produtos add column if not exists hs text, add column if not exists nome_kr text, add column if not exists nome_en text, add column if not exists ingredientes text, add column if not exists comp_cm numeric, add column if not exists larg_cm numeric, add column if not exists alt_cm numeric;
