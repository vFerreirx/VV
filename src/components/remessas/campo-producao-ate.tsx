'use client'

// "PRODUÇÃO ATÉ" — o mesmo campo no "Full manual", na importação por PDF e na
// edição da remessa. Três cópias do "preenchido com o padrão, editável, volta
// ao padrão" divergiriam no primeiro ajuste.
//
// ⚠️ O VALOR É `null` ENQUANTO NINGUÉM MEXEU. Nulo é o padrão (envio menos a
// folga — src/lib/producao/prazo-da-remessa.ts), e é gravado como nulo: assim,
// se a data de envio mudar depois, o prazo acompanha sozinho. Só vira data
// quando alguém escolhe OUTRO dia de propósito. Escolher o próprio padrão à
// mão volta a ser nulo.

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  FOLGA_DIAS_PRODUCAO,
  erroDoProducaoAte,
  producaoAtePadrao,
} from '@/lib/producao/prazo-da-remessa'

export function CampoProducaoAte({
  id,
  dataEnvio,
  valor,
  onChange,
  disabled,
}: {
  id: string
  /** '' enquanto a data de envio não foi escolhida. */
  dataEnvio: string
  /** null = padrão. */
  valor: string | null
  onChange: (valor: string | null) => void
  disabled?: boolean
}) {
  const padrao = dataEnvio ? producaoAtePadrao(dataEnvio) : ''
  const mostrado = valor ?? padrao
  const erro = dataEnvio ? erroDoProducaoAte(dataEnvio, valor) : null

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Produção até</Label>
      <Input
        id={id}
        type="date"
        value={mostrado}
        max={padrao || undefined}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' || v === padrao ? null : v)
        }}
        disabled={disabled || !dataEnvio}
      />
      {erro ? (
        <p className="text-destructive text-xs">{erro}</p>
      ) : !dataEnvio ? (
        <p className="text-muted-foreground text-xs">
          Escolha a data de envio primeiro.
        </p>
      ) : valor === null ? (
        <p className="text-muted-foreground text-xs">
          Padrão: {FOLGA_DIAS_PRODUCAO} dias antes do envio, pra costura e
          separação.
        </p>
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Voltar ao padrão ({FOLGA_DIAS_PRODUCAO} dias antes do envio)
        </button>
      )}
    </div>
  )
}
