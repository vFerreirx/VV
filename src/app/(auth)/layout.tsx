// Layout simples (centralizado) compartilhado por /login e /recuperar-senha.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="bg-card border-border w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Malharia MVP
          </p>
        </div>
        {children}
      </div>
    </main>
  )
}
