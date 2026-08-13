-- §17.10: chave estrangeira para o usuário responsável pelo cancelamento.
--
-- Sem ela, o campo criado justamente para atender "usuário responsável"
-- apontava para um id que podia deixar de existir, e o nome de quem cancelou
-- não era consultável. Mesmo tratamento do irmão `recorded_by_user_id`.
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_canceled_by_user_id_fkey" FOREIGN KEY ("canceled_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
