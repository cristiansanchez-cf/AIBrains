-- La formación presencial del creador, para poder recomendarla.
--
-- Alfonso y Cristian, a quien les pide el guion exacto, le responden: "te lo doy
-- si quieres, pero nunca vas a vender mejor que yo". No es el qué se dice, es el
-- cómo — tono, ritmo, silencios, no verbal, y horas de práctica con alguien
-- delante corrigiendo.
--
-- El cerebro ES la respuesta a esa petición. El creador puede decir "¿quieres mi
-- guion? toma mi cerebro, inténtalo", y entonces la persona tiene todos los
-- recursos, está pagando, lo intenta, y sigue sin cerrar. Ahí entiende por
-- experiencia propia —no porque se lo digan— que le falta lo otro.
--
-- Para la negociación esto pesa más que el reparto: el cerebro deja de competir
-- con su formación y pasa a ser su captación.

alter table public.creadores
  add column if not exists formacion_url  text,
  add column if not exists formacion_nota text;

comment on column public.creadores.formacion_url is
  'Programa de formación del creador. Solo se nombra si hay acuerdo firmado.';
comment on column public.creadores.formacion_nota is
  'Cómo describirlo en una línea, con las palabras del creador.';

-- ---------------------------------------------------------------------------
-- SE QUEDAN VACÍAS A PROPÓSITO
-- ---------------------------------------------------------------------------
-- Nombrar el curso de alguien desde un producto que no ha autorizado insinúa una
-- relación que no existe, y es de las cosas que acaban en burofax. Sin acuerdo,
-- la recomendación se hace en genérico: "el guion no lo es todo, plantéate
-- formación presencial". Con acuerdo, se nombra el programa.
--
-- Esa es justamente la pieza que hace valioso firmar: se activa al hacerlo.

-- Y no basta con decirlo en un comentario: la base lo impide.
--
-- Sin esto, dentro de seis meses alguien rellena la URL "para probar" y el
-- producto empieza a promocionar el curso de una persona que no ha autorizado
-- nada. Un CHECK cuesta una línea y convierte una convención en una garantía.
alter table public.creadores
  drop constraint if exists creadores_formacion_exige_acuerdo;

alter table public.creadores
  add constraint creadores_formacion_exige_acuerdo
  check (formacion_url is null or acuerdo_firmado);
