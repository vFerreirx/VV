'use client'

import { useEffect, useState } from 'react'

import { duracaoEmPalavras } from '@/lib/producao/parada-de-maquina'

// "HÁ QUANTO TEMPO" — a aba Máquinas (/fabrica) e o tablet da estação usam o
// mesmo hook, pra "Parada: quebra · há 2 h" sair igual nas duas telas.
//
// ⚠️ SÓ DEPOIS DE MONTAR. O texto sai de `new Date()`, que no servidor é uma
// hora e no navegador é outra — renderizar na primeira passada daria
// divergência de hidratação numa linha que muda de minuto em minuto. Começa
// nulo (o cartão mostra só o rótulo) e aparece logo em seguida.
//
// O intervalo de um minuto é o que mantém "há 3 min" honesto sem recarregar:
// a parada é o único dado destas telas que muda sozinho com o relógio.
//
// `agora` é o relógio contra o qual medir. O início da parada foi gravado pelo
// SERVIDOR; o tablet da estação passa o `agoraNoServidor` da trava
// (src/lib/auth/inatividade.ts), porque medir contra um tablet atrasado meia
// hora faria a parada de agora aparecer como "menos de 1 min" por meia hora.
// Sem nada, é o relógio do navegador — o de sempre na /fabrica, no desktop.
// Precisa ser uma função ESTÁVEL (useCallback), senão o intervalo reinicia a
// cada render.
export function useDuracaoDesde(
  inicio: Date | null,
  agora: () => number = Date.now,
): string | null {
  const [texto, setTexto] = useState<string | null>(null)

  useEffect(() => {
    if (!inicio) return
    const atualizar = () =>
      setTexto(duracaoEmPalavras(inicio, new Date(agora())))
    const id = setInterval(atualizar, 60_000)
    atualizar()
    return () => clearInterval(id)
  }, [inicio, agora])

  // O descarte é NA LEITURA e não num `setTexto(null)` dentro do efeito:
  // limpar estado ali é justamente o `set-state-in-effect` que o lint recusa,
  // e o resultado é o mesmo — máquina sem parada aberta não mostra tempo.
  return inicio ? texto : null
}
