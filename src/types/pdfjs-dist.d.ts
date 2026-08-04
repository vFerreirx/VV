// O `pdf.worker.mjs` do pdfjs não vem com tipos (só o `pdf.mjs` tem um
// `.d.mts` ao lado). Nós nunca mexemos no conteúdo dele — só carregamos o
// módulo e entregamos inteiro pro pdfjs em `globalThis.pdfjsWorker`, então
// `unknown` basta. Veja o porquê em `src/lib/full-import/pdf-texto.ts`.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
