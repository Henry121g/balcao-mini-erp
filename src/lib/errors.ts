// Traduz erros do banco (códigos lançados pelas funções SQL) em mensagens para o usuário.
// Detalhes técnicos nunca chegam à interface; o `detail` só é usado quando é informação de negócio.

const MESSAGES: Record<string, string> = {
  ESTOQUE_INSUFICIENTE: "Estoque insuficiente",
  VENDA_SEM_ITENS: "Adicione ao menos um item à venda.",
  VENDA_ITENS_DEMAIS: "Uma venda pode ter no máximo 100 itens diferentes.",
  QUANTIDADE_INVALIDA: "Quantidade inválida. Use números inteiros maiores que zero.",
  PRODUTO_INVALIDO: "Um dos produtos não está disponível (inativo ou inexistente). Atualize a página.",
  DESCONTO_INVALIDO: "O desconto não pode ser negativo nem maior que o subtotal.",
  CUSTO_INVALIDO: "Custo unitário inválido.",
  MOTIVO_OBRIGATORIO: "Informe o motivo da movimentação.",
  AJUSTE_SEM_DIFERENCA: "A contagem informada é igual ao saldo atual; nada a ajustar.",
  TIPO_INVALIDO: "Tipo de movimentação inválido.",
  VENDA_INEXISTENTE: "Venda não encontrada.",
  VENDA_JA_CANCELADA: "Esta venda já foi cancelada.",
  SEM_PERMISSAO: "Seu perfil não tem permissão para esta ação.",
};

export const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente em instantes.";

export function friendlyDbError(
  error: { message?: string; code?: string; details?: string | null } | null | undefined,
): string {
  if (!error) return GENERIC_ERROR;
  const key = Object.keys(MESSAGES).find((k) => error.message?.includes(k));
  if (key === "ESTOQUE_INSUFICIENTE") {
    return error.details ? `Estoque insuficiente: ${error.details}.` : `${MESSAGES[key]}.`;
  }
  if (key) return MESSAGES[key];
  if (error.code === "42501") return MESSAGES.SEM_PERMISSAO;
  if (error.code === "23505") return "Já existe um registro com esse código ou nome.";
  if (error.message?.includes("row-level security")) return MESSAGES.SEM_PERMISSAO;
  return GENERIC_ERROR;
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este e-mail.",
  weak_password: "Senha fraca. Use ao menos 8 caracteres, com letras e números.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente novamente.",
};

export function friendlyAuthError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  return (error.code && AUTH_MESSAGES[error.code]) || GENERIC_ERROR;
}
