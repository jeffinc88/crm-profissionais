# Carteiras: cada profissional pode ter um vendedor responsável

Com mais vendedores e representantes usando o CRM, cada Profissional passa a ter um **Responsável** (a carteira). O vendedor vê e trabalha só a própria carteira; Gerencial e Operacional veem a base inteira. Só o Gerencial define ou transfere o responsável; quem cadastra um profissional novo vira o responsável automaticamente, e o banco impede o vendedor de cadastrar alguém que já existe (mesmo telefone), com a mensagem "fale com a gerência" — sem revelar de quem é. Profissional sem contato registrado há X dias (padrão 90) aparece em "Carteiras paradas" para a gerência decidir; nada é retirado automaticamente.

Considerou-se a base compartilhada (todos veem todos) e a carteira exclusiva por quem cadastra; a escolhida mantém a base como ativo da fábrica — se um vendedor sai, a carteira fica.

**Substitui em parte a ADR 0001:** representantes agora entram no CRM, mas só enxergam a própria carteira.

**Ajusta a ADR 0003:** em vendas originadas por profissional da carteira do próprio representante, ele recebe comissão reduzida (o valor é calculado fora do CRM); nos demais casos a regra da ADR 0003 continua.
