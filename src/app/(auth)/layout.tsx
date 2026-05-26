import { Logo } from '@/components/brand/logo'

// Layout simples (centralizado) usado pelo /login.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="bg-card border-border w-full max-w-sm rounded-xl border p-8 shadow-sm">
        <div className="mb-8 flex justify-center">
          <Logo variant="full" />
        </div>
        {children}
      </div>
    </main>
  )
}
