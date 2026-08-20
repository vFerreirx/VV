import { Logo } from '@/components/brand/logo'

// Layout simples (centralizado) usado pelo /login.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center pt-[max(1rem,var(--sa-top,env(safe-area-inset-top)))] pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))] pb-[max(1rem,var(--sa-bottom,env(safe-area-inset-bottom)))] pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))]">
      <div className="bg-card border-border animate-in fade-in zoom-in-95 slide-in-from-bottom-2 w-full max-w-sm rounded-xl border p-8 shadow-sm duration-500 motion-reduce:animate-none">
        <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both mb-8 flex justify-center delay-150 duration-700 motion-reduce:animate-none">
          <Logo variant="full" />
        </div>
        {children}
      </div>
    </main>
  )
}
