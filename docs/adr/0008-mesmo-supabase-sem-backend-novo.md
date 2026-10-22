# CRM no mesmo projeto Supabase do app, acessado direto pelo front

O CRM usa o mesmo projeto Supabase do app comercial, com tabelas próprias protegidas por RLS, e o front publicado no GitHub Pages fala direto com o Supabase, sem passar pelo backend do Railway. Assim o app enxerga os dados do CRM sem uma API nova. A consequência é ter dois sistemas de login: o JWT próprio no app e o Supabase Auth no CRM.
