'use client'

// DEBUG TEMPORÁRIO: fronteira de erro só pra distinguir erro de render
// (cai aqui) de erro de fetch/auth (cai no try/catch da page). Em produção
// a mensagem vem redigida, mas o digest ajuda a correlacionar no log.
export default function VariacoesError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        padding: 20,
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      {'DEBUG /variacoes — erro no RENDER (client boundary):\n\n' +
        'message: ' +
        error.message +
        '\ndigest: ' +
        (error.digest ?? '(sem digest)')}
    </pre>
  )
}
