import { Logo } from '@/components/brand/logo'

// Layout simples (centralizado) usado pelo /login.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="bg-card border-border animate-in fade-in zoom-in-95 slide-in-from-bottom-2 w-full max-w-sm rounded-xl border p-8 shadow-sm duration-500 motion-reduce:animate-none">
        <div className="animate-in fade-in slide-in-from-bottom-1 mb-8 flex justify-center delay-150 duration-700 fill-mode-both motion-reduce:animate-none">
          <Logo variant="full" />
        </div>
        {children}
      </div>
    </main>
  )
}
