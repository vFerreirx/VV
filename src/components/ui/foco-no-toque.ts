"use client"

import * as React from "react"

import { focoLongeDosCampos, type TipoDeInteracao } from "@/lib/foco-no-toque"

// O TECLADO DO TABLET SÓ SOBE QUANDO O OPERADOR TOCA NO CAMPO.
//
// O Vitor viu no tablet (01/10): tocar numa máquina abria "Iniciar na
// Máquina N" e o teclado subia sozinho, cobrindo metade da lista de OPs. Não
// era `autoFocus` de ninguém — era o próprio diálogo: o Popup da Base UI, ao
// abrir, foca o primeiro elemento tabulável, e o primeiro era a busca.
//
// A Base UI já evita isso no toque, mas só quando o diálogo abre pelo
// `Trigger` dela, que é quem mede o ponteiro. Nossos diálogos abrem por
// `open=` controlado, e ela recebe `''` — "não sei" — e foca o campo. Então
// medimos aqui: o último ponteiro/tecla da página, ouvido na captura, antes
// de qualquer `onClick` abrir o que for. A regra em si é pura e testada em
// `src/lib/foco-no-toque.ts`.

let ultimoGesto: TipoDeInteracao = ""

if (typeof window !== "undefined") {
  const opcoes = { capture: true, passive: true }
  window.addEventListener(
    "pointerdown",
    (e) => {
      ultimoGesto = e.pointerType as TipoDeInteracao
    },
    opcoes
  )
  // No Safari do iPad, o toque na borda de um alvo às vezes não dispara
  // `pointerdown` (só `mousedown`); o `touchstart` vem sempre.
  window.addEventListener(
    "touchstart",
    () => {
      ultimoGesto = "touch"
    },
    opcoes
  )
  window.addEventListener(
    "keydown",
    () => {
      ultimoGesto = "keyboard"
    },
    opcoes
  )
}

/** Se o gesto que está acontecendo agora foi de dedo ou caneta. */
export function gestoDeToque(tipoDaBaseUi: TipoDeInteracao = ""): boolean {
  return focoLongeDosCampos(tipoDaBaseUi, ultimoGesto)
}

/**
 * O `initialFocus` padrão de DialogContent e SheetContent. No toque devolve o
 * PRÓPRIO painel (o Popup tem `tabIndex={-1}`): o foco entra no diálogo e
 * fica preso nele como sempre, mas nenhum campo recebe e o teclado não sobe.
 * Nos outros casos, `true` — o padrão da Base UI, primeiro tabulável.
 *
 * Devolve também o ref a pendurar no Popup, já juntado com o de quem chama
 * (o menu do celular passa um pro SheetContent).
 *
 * O painel fica em ESTADO, não em `useRef`, pra função não ler ref durante o
 * render (o React Compiler recusa). Chega a tempo: o ref é preso no commit, o
 * React refaz o render na hora, e a Base UI só chama `initialFocus` num
 * microtask depois disso.
 */
export function useFocoInicialDoPainel(
  refDeQuemChama: React.Ref<HTMLDivElement> | undefined
) {
  const [painel, setPainel] = React.useState<HTMLDivElement | null>(null)

  const prenderPainel = React.useCallback(
    (el: HTMLDivElement | null) => {
      setPainel(el)
      atribuirRef(refDeQuemChama, el)
    },
    [refDeQuemChama]
  )

  const focoInicial = React.useCallback(
    // Painel ainda `null` cai no padrão da Base UI — o de antes desta regra.
    (tipo: TipoDeInteracao) => (gestoDeToque(tipo) ? painel : true),
    [painel]
  )

  return { prenderPainel, focoInicial }
}

function atribuirRef<T>(ref: React.Ref<T> | undefined, valor: T | null) {
  if (typeof ref === "function") ref(valor)
  else if (ref) ref.current = valor
}
