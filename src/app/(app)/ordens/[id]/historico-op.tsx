import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, Gauge, History } from 'lucide-react'

import { historicoDaOrdem } from '../actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

// Linha do tempo da OP: quem mexeu, quando, de qual status pra qual, e a
// observação quando houver — mais os apontamentos de produção na mesma
// lista.
//
// Só LEITURA do que `eventos_kanban` e `apontamentos_producao` já gravam
// desde sempre. Nenhuma tabela, nenhuma coluna, nenhuma permissão nova: a
// página da OP já tem a guarda dela, e `historicoDaOrdem` chama requireAuth
// como o resto das leituras do arquivo.
//
// É esta tela que responde "o admin/gerente mexeu nessa OP?" — o caso que o
// item C deixa acontecer DE PROPÓSITO sem trocar o responsável.
export async function HistoricoDaOp({ ordemId }: { ordemId: string }) {
  const itens = await historicoDaOrdem(ordemId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" />
          Histórico
        </CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nada registrado ainda. Cada movimento no kanban e cada apontamento
            de produção aparecem aqui.
          </p>
        ) : (
          <ol className="space-y-3">
            {itens.map((item, i) => (
              <li
                key={i}
                className="border-border flex gap-3 border-l-2 pl-3 text-sm"
              >
                <div className="text-muted-foreground w-28 shrink-0 text-xs tabular-nums">
                  {format(new Date(item.em), "dd/MM/yy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  {item.tipo === 'status' ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.statusAnterior && (
                        <>
                          <span className="text-muted-foreground">
                            {STATUS_LABEL_CURTO[item.statusAnterior]}
                          </span>
                          <ArrowRight className="text-muted-foreground size-3 shrink-0" />
                        </>
                      )}
                      <span className="font-medium">
                        {STATUS_LABEL_CURTO[item.statusNovo]}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Gauge className="text-muted-foreground size-3 shrink-0" />
                      <span className="font-medium">
                        Apontou {item.produzida.toLocaleString('pt-BR')} un
                      </span>
                      {item.refugo > 0 && (
                        <span className="text-destructive">
                          · {item.refugo.toLocaleString('pt-BR')} de refugo
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-muted-foreground text-xs">
                    {item.autorNome ?? 'Usuário removido'}
                  </div>

                  {item.tipo === 'status' && item.observacao && (
                    <p className="text-muted-foreground mt-0.5 text-xs italic">
                      {item.observacao}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
