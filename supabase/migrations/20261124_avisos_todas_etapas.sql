-- ERP v173: e-mail à cliente opcional em todas as etapas (tipos novos de aviso)
alter table public.avisos_cliente drop constraint if exists avisos_cliente_tipo_check;
alter table public.avisos_cliente add constraint avisos_cliente_tipo_check check (tipo = any (array['separando','preparado','liberado','pago','etiqueta','skyroad','consolidado','awb','rfkr','manifesto']));
