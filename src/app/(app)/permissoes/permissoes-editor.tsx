'use client'

import {
  ChevronDown,
  CircleCheck,
  Eye,
  Lock,
  Minus,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  contarLimpezasDePermissao,
  limparPermissoesIguaisAoPadraoAction,
  limparPermissoesOrfasAction,
  salvarPermissoesAction,
  type ContagemDeLimpeza,
  type ItemPermissao,
} from './actions'
import { Button } from '@/components/ui/button'
import {
  AREAS,
  chaveOverride,
  NIVEL_INFO,
  NIVEL_OPCOES,
  opcaoDoNivel,
  ROLE_INFO,
  ROLES,
  ROLES_EDITAVEIS,
  type Area,
  type AreaKey,
  type Nivel,
  type OpcaoNivel,
  type OverridesAcesso,
  type Role,
} from '@/lib/auth/permissoes'
import { cn } from '@/lib/utils'

const NIVEL_ICON: Record<Nivel, LucideIcon> = {
  total: CircleCheck,
  ver: Eye,
  proprio: UserCheck,
  nenhum: Minus,
}

const NIVEL_CLASSE: Record<Nivel, string> = {
  total: 'text-emerald-600 dark:text-emerald-400',
  ver: 'text-muted-foreground',
  proprio: 'text-amber-600 dark:text-amber-400',
  nenhum: 'text-muted-foreground/35',
}

function NivelMarca({ nivel }: { nivel: Nivel }) {
  const Icon = NIVEL_ICON[nivel]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium',
        NIVEL_CLASSE[nivel],
      )}
    >
      <Icon className="size-4 shrink-0" />
      {NIVEL_INFO[nivel].label}
    </span>
  )
}

const EDITAVEIS = new Set<Role>(ROLES_EDITAVEIS)

function estadoInicial(overrides: OverridesAcesso): Record<string, OpcaoNivel> {
  const m: Record<string, OpcaoNivel> = {}
  for (const area of AREAS) {
    if (!area.editavel) continue
    for (const role of ROLES_EDITAVEIS) {
      const key = chaveOverride(role, area.key)
      m[key] = opcaoDoNivel(overrides[key] ?? area.nivelPadrao[role])
    }
  }
  return m
}

const SECOES = [...new Set(AREAS.map((a) => a.secao))]

// O PADRÃO DO CÓDIGO na linguagem da tela (nenhum/ver/total). É com ele que
// cada célula se compara pra dizer "padrão" ou "alterado" — e a comparação é
// contra o VALOR, não contra a existência da linha no banco: as 52 linhas que
// só repetem o padrão já aparecem como padrão, antes de qualquer limpeza.
function padraoDaCelula(area: Area, role: Role): OpcaoNivel {
  return opcaoDoNivel(area.nivelPadrao[role])
}

export function PermissoesEditor({
  overrides,
}: {
  overrides: OverridesAcesso
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const inicial = useMemo(() => estadoInicial(overrides), [overrides])
  const [valores, setValores] = useState<Record<string, OpcaoNivel>>(inicial)
  const [baseline, setBaseline] = useState<Record<string, OpcaoNivel>>(inicial)

  const sujo = useMemo(
    () => Object.keys(valores).some((k) => valores[k] !== baseline[k]),
    [valores, baseline],
  )

  // Quantas células diferem do padrão do código AGORA (contando o que está na
  // tela, salvo ou não). É o número que responde "o quanto isto aqui foi
  // customizado" — em 21/09/2026 eram 20, das 76 linhas gravadas.
  const alteradas = useMemo(() => {
    let n = 0
    for (const area of AREAS) {
      if (!area.editavel) continue
      for (const role of ROLES_EDITAVEIS) {
        const key = chaveOverride(role, area.key)
        if ((valores[key] ?? 'nenhum') !== padraoDaCelula(area, role)) n += 1
      }
    }
    return n
  }, [valores])

  function definir(role: Role, area: AreaKey, nivel: OpcaoNivel) {
    setValores((p) => ({ ...p, [chaveOverride(role, area)]: nivel }))
  }

  // Volta a ÁREA inteira pro padrão do código. Por área e não por célula
  // porque a pergunta que se faz é "como isto era antes de mexerem?", e ela é
  // sobre a linha que se está olhando.
  function voltarAoPadrao(area: Area) {
    setValores((p) => {
      const novo = { ...p }
      for (const role of ROLES_EDITAVEIS) {
        novo[chaveOverride(role, area.key)] = padraoDaCelula(area, role)
      }
      return novo
    })
  }

  function salvar() {
    const itens: ItemPermissao[] = []
    for (const area of AREAS) {
      if (!area.editavel) continue
      for (const role of ROLES_EDITAVEIS) {
        itens.push({
          role,
          area: area.key,
          nivel: valores[chaveOverride(role, area.key)] ?? 'nenhum',
        })
      }
    }
    startTransition(async () => {
      const r = await salvarPermissoesAction(itens)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Salvo')
      setBaseline(valores)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="text-muted-foreground text-sm">
        {alteradas === 0 ? (
          'Tudo no padrão do sistema.'
        ) : (
          <>
            <strong className="text-foreground font-medium">
              {alteradas}{' '}
              {alteradas === 1 ? 'alteração' : 'alterações'}
            </strong>{' '}
            em relação ao padrão do sistema. O que está no padrão acompanha as
            atualizações; o que foi alterado fica como você deixou.
          </>
        )}
      </div>

      {SECOES.map((secao) => (
        <div key={secao} className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            {secao}
          </h2>
          <div className="vv-stagger space-y-3">
            {AREAS.filter((a) => a.secao === secao).map((area) => (
              <div key={area.key} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{area.label}</div>
                    <div className="text-muted-foreground text-sm">
                      {area.descricao}
                    </div>
                  </div>
                  {!area.editavel ? (
                    <span className="text-muted-foreground/60 inline-flex items-center gap-1 text-xs">
                      <Lock className="size-3" />
                      fixo
                    </span>
                  ) : (
                    ROLES_EDITAVEIS.some(
                      (role) =>
                        (valores[chaveOverride(role, area.key)] ?? 'nenhum') !==
                        padraoDaCelula(area, role),
                    ) && (
                      <button
                        type="button"
                        onClick={() => voltarAoPadrao(area)}
                        disabled={isPending}
                        className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-2"
                      >
                        voltar ao padrão
                      </button>
                    )
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {ROLES.map((role) => {
                    const editavel = area.editavel && EDITAVEIS.has(role)
                    const key = chaveOverride(role, area.key)
                    const valor = valores[key] ?? 'nenhum'
                    const nivelFixo: Nivel =
                      role === 'admin' ? 'total' : area.nivelPadrao[role]
                    return (
                      <div
                        key={role}
                        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0"
                      >
                        <span className="text-muted-foreground text-sm">
                          {ROLE_INFO[role].label}
                        </span>
                        {editavel ? (
                          <span className="inline-flex items-center gap-2">
                            {/* A ORIGEM DO VALOR, por célula. Sem isso, a
                                tela não distingue o que alguém escolheu do
                                que veio do código — e foi exatamente essa
                                confusão que deixou 52 linhas gravadas
                                repetindo o padrão. */}
                            <span
                              className={cn(
                                'text-[11px]',
                                valor === padraoDaCelula(area, role)
                                  ? 'text-muted-foreground/60'
                                  : 'text-amber-600 dark:text-amber-500',
                              )}
                            >
                              {valor === padraoDaCelula(area, role)
                                ? 'padrão'
                                : 'alterado'}
                            </span>
                            <SegNivel
                              valor={valor}
                              disabled={isPending}
                              onChange={(n) => definir(role, area.key, n)}
                            />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <NivelMarca nivel={nivelFixo} />
                            <Lock className="text-muted-foreground/40 size-3" />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <BlocoDeManutencao />

      {sujo && (
        <div className="bg-background/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))] pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))]">
            <span className="text-muted-foreground text-sm">
              Há alterações não salvas.
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setValores(baseline)}
                disabled={isPending}
              >
                Descartar
              </Button>
              <Button loading={isPending} onClick={salvar} disabled={isPending}>
                {'Salvar permissões'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Controle segmentado de 3 opções: Desativado / Só ver / Controle total.
function SegNivel({
  valor,
  disabled,
  onChange,
}: {
  valor: OpcaoNivel
  disabled: boolean
  onChange: (n: OpcaoNivel) => void
}) {
  return (
    <div className="bg-muted/60 inline-flex shrink-0 rounded-md p-0.5">
      {NIVEL_OPCOES.map((o) => {
        const ativo = valor === o.value
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={ativo}
            title={o.descricao}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
              ativo
                ? o.value === 'nenhum'
                  ? 'bg-background text-muted-foreground shadow-sm'
                  : o.value === 'ver'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// -----------------------------------------------------------------
// Manutenção
// -----------------------------------------------------------------

// AS DUAS LIMPEZAS, E SÓ POR CLIQUE. Elas apagam linha de permissão — rodar
// sozinhas, no deploy ou junto do salvamento, seria mexer em quem abre o quê
// sem ninguém ter pedido. A contagem carrega ao abrir o bloco e a action
// recalcula no clique: o número da tela pode estar velho, o da action não.
//
// Nenhuma das duas muda o que alguém enxerga hoje: a primeira apaga linha que
// repete o padrão, a segunda apaga linha de área que não existe mais (e que
// `nivelEfetivo` já ignora).
function BlocoDeManutencao() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [contagem, setContagem] = useState<ContagemDeLimpeza | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrir() {
    setAberto((v) => !v)
    if (contagem === null) {
      contarLimpezasDePermissao()
        .then(setContagem)
        .catch(() => toast.error('Não deu pra contar as linhas'))
    }
  }

  function limpar(qual: 'padrao' | 'orfas') {
    const pergunta =
      qual === 'padrao'
        ? 'Apagar as linhas que só repetem o padrão? Ninguém muda de acesso: essas células passam a seguir o padrão do sistema.'
        : 'Apagar as linhas de áreas que não existem mais? Elas já não fazem efeito nenhum.'
    if (!window.confirm(pergunta)) return

    startTransition(async () => {
      const r =
        qual === 'padrao'
          ? await limparPermissoesIguaisAoPadraoAction()
          : await limparPermissoesOrfasAction()
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Pronto')
      setContagem(await contarLimpezasDePermissao())
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 border-t pt-6">
      <button
        type="button"
        onClick={abrir}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
      >
        <ChevronDown
          className={cn('size-4 transition-transform', aberto && 'rotate-180')}
        />
        Manutenção da tabela de permissões
      </button>

      {aberto && (
        <div className="space-y-3 rounded-lg border p-4 text-sm">
          <p className="text-muted-foreground text-xs">
            Nada aqui muda o acesso de ninguém — é limpeza de linha que não faz
            efeito. Cada botão pergunta antes.
          </p>

          {contagem === null ? (
            <p className="text-muted-foreground text-xs">contando…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {contagem.iguaisAoPadrao === 0
                    ? 'Nenhuma linha repetindo o padrão.'
                    : `${contagem.iguaisAoPadrao} linha${contagem.iguaisAoPadrao === 1 ? '' : 's'} gravada${contagem.iguaisAoPadrao === 1 ? '' : 's'} igual${contagem.iguaisAoPadrao === 1 ? '' : 'is'} ao padrão.`}
                </span>
                {contagem.iguaisAoPadrao > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => limpar('padrao')}
                  >
                    Limpar
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span>
                  {contagem.orfas === 0
                    ? 'Nenhuma linha de área inexistente.'
                    : `${contagem.orfas} linha${contagem.orfas === 1 ? '' : 's'} de área${contagem.orfas === 1 ? '' : 's'} que não existe${contagem.orfas === 1 ? '' : 'm'} mais.`}
                </span>
                {contagem.orfas > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => limpar('orfas')}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
