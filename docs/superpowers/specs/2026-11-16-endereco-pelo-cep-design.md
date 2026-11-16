# Endereço preenchido pelo CEP (Q337 a Q340)

Pedido do usuário em 16/11/2026: "quero saber se conseguimos colocar o auto
completar o endereço quando digitar o CEP, me passe um plano para implementar
esse recurso". Plano aprovado na conversa ("sim").

## Decisões

| # | decisão | por quê |
|---|---|---|
| Q337 | **O servidor busca o CEP, a tela não fala com serviço de fora.** Rota `GET /api/v1/cep/[cep]` (action `buscarCepAction`), para qualquer usuário logado do tenant. Consulta o ViaCEP e, se ele falhar ou demorar, a BrasilAPI. Tempo máximo de 3 segundos por serviço. Só os 8 números do CEP saem para fora: nada do tenant, do usuário ou do cliente | plano aprovado; sem chave nova e sem expor o usuário a terceiros |
| Q338 | **Resposta e recusas.** 200 `{ cep, street, district, city, state }` (state é a UF, campos vazios viram `null`). CEP sem 8 números: 422 `VALIDATION_ERROR` em `cep`, "CEP inválido. Use os 8 números.". CEP que não existe: 404 `NOT_FOUND`, "CEP não encontrado. Confira ou preencha o endereço à mão.". Os dois serviços fora: 503 `SERVICE_UNAVAILABLE`, "Não deu para buscar o CEP agora. Preencha o endereço à mão." | o cadastro nunca trava por causa do serviço de fora |
| Q339 | **Cache e limite.** O endereço achado fica no Redis por 30 dias (chave global `tibe:cep:<8 números>`: CEP é dado público, igual para todo tenant); CEP inexistente fica 1 dia. Redis fora não quebra a busca, só não guarda. Limite de 60 buscas por usuário por minuto (429 `RATE_LIMITED`) | CEP quase não muda; evita abuso da rota como proxy |
| Q340 | **Na tela:** ao completar os 8 números do CEP, o formulário busca e preenche Rua, Bairro, Cidade e UF. Rua e Bairro já digitados não são sobrescritos (CEP de cidade pequena vem sem rua); Cidade e UF são preenchidas pelo CEP. Depois de preencher, o foco vai para Número. Enquanto busca, mostra "Buscando o CEP..." junto ao campo; na recusa, mostra a frase da Q338 junto ao campo, sem bloquear o salvar. Vale nos endereços: principal e de entrega do cliente, do fornecedor, do franqueado e do contato (`campos-do-cadastro.tsx`), da loja (`estabelecimento-form.tsx`) e do pedido para entrega no balcão (`pedido-para-entrega-campos.tsx`) | plano aprovado |

## Fora

Busca do CEP pelo endereço (o inverso); validar se o número existe na rua;
o agente do WhatsApp.

## O que fica com o builder

O nome do hook e dos arquivos novos; o texto exato do "Buscando"; o formato
interno do cache.
