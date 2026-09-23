export type Proprietario = {
  id: string;
  nome: string;
  documento_identidad: string;
  telefone_whatsapp: string | null;
  email: string | null;
};

export type Unidade = {
  id: string;
  identificacao: string;
  proprietario_id: string;
  gera_cobranca: boolean;
  created_at: string;
  proprietario: Pick<Proprietario, "id" | "nome"> | null;
};
