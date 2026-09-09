// A Document Picture-in-Picture API (Chrome/Edge 116+) ainda NÃO está no
// `lib.dom.d.ts` do TypeScript — conferido: zero ocorrências de
// `documentPictureInPicture` lá. Sem esta declaração o `tsc` não conhece
// `window.documentPictureInPicture` e o type-check quebra.
//
// Mesmo papel de `src/types/pdfjs-dist.d.ts` e `src/types/react-canary.d.ts`:
// tipo que o pacote (aqui, o próprio DOM) não entrega, puxado na mão.
//
// ⚠️ SEM `export {}` NO FIM, ao contrário do react-canary.d.ts. Um arquivo
// com import ou export vira MÓDULO, e `interface Window` dentro de um módulo
// deixa de aumentar o `Window` global — a declaração compilaria e não valeria
// pra nada. Este arquivo é script global de propósito.
//
// A tipagem é o MÍNIMO que src/app/(app)/tarefas/tarefa-pip.tsx usa, e a
// propriedade é OPCIONAL de propósito: `documentPictureInPicture?:` é o que
// obriga quem chama a testar o suporte antes (Firefox e Safari não têm a
// API), em vez de descobrir com um TypeError na mão do usuário.

interface DocumentPictureInPictureOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

interface DocumentPictureInPicture extends EventTarget {
  /** A janela aberta, ou `null`. Existe UMA por documento. */
  readonly window: Window | null
  /**
   * Abre a janela. SÓ funciona a partir de gesto do usuário, e com uma
   * janela já aberta ela NÃO abre a segunda.
   */
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture
}
