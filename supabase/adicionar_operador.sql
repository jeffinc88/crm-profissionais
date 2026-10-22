-- Rodar no SQL Editor do Supabase DEPOIS de criar o usuário em
-- Authentication › Users › Add user (e-mail + senha, "Auto Confirm User").
-- Troque o e-mail, o nome e o perfil ('gerencial' ou 'operacional').

insert into public.crm_operadores (user_id, nome, perfil)
select id, 'Jefferson', 'gerencial'
  from auth.users where email = 'jeffinc88@gmail.com'
on conflict (user_id) do update set nome = excluded.nome, perfil = excluded.perfil, ativo = true;
