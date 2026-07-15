// Detecta violação de unicidade do Postgres (SQLSTATE 23505), tanto no erro
// cru do postgres-js quanto embrulhado pelo Drizzle (que põe o original em
// `cause`). Usado nas actions pra transformar corridas de INSERT em erro
// amigável em vez de 500.
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}
