-- Feriado não é atraso: se a fonte foi consultada hoje com sucesso, tudo o que ela publicou já está
-- em cotacao_bcv e a vigente é a correta, mesmo sendo anterior ao último dia útil. data_fonte guarda
-- a "fecha valor" que a fonte devolveu na última consulta (null quando nenhuma fonte respondeu).
alter table cotacao_bcv_consulta add column data_fonte date;
