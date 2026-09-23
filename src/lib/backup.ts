// O BACKUP ESTÁ ACONTECENDO?
//
// O backup roda numa tarefa do Windows na máquina da casa (scripts/backup-db.ts)
// e, quando dá certo, deixa uma linha em `backups_registro`. O sistema não
// enxerga o Drive nem a máquina — só essa linha. Este arquivo decide, a partir
// da MAIS RECENTE, se está tudo bem; o dashboard e o sino do admin perguntam
// aqui, e por isso os dois nunca discordam.
//
// Lógica pura, sem banco e sem React (e sem `@/` nos imports): roda no runner
// do Node, em src/lib/producao/regras.test.ts.

import { diaEmBrasilia, diasEntre, horaEmBrasilia } from './dia-brasil.ts'

// DOIS DIAS, e não um. A tarefa roda todo dia às 09h; num fim de semana com o
// computador desligado, o "executar quando disponível" do Agendador recupera
// na segunda de manhã. Com um dia, o sino acenderia todo domingo por uma
// coisa que se resolve sozinha — e sino sempre aceso deixa de ser lido. Com
// dois, a tarefa QUEBRADA aparece no segundo dia sem backup.
export const DIAS_BACKUP_ATRASADO = 2

const HORA_MS = 60 * 60 * 1000

export type EstadoDoBackup = 'nunca' | 'atrasado' | 'sem_drive' | 'em_dia'

export type UltimoBackup = { feitoEm: Date; copiaDrive: boolean }

export function estadoDoBackup(
  ultimo: UltimoBackup | null,
  agora: Date,
): EstadoDoBackup {
  if (!ultimo) return 'nunca'
  // ATRASADO VENCE O SEM DRIVE: é o pior dos dois. Um backup velho que também
  // não foi pro Drive continua sendo, antes de tudo, um backup velho — dizer
  // só "não chegou no Drive" esconderia que parou de rodar.
  const horas = (agora.getTime() - ultimo.feitoEm.getTime()) / HORA_MS
  if (horas > DIAS_BACKUP_ATRASADO * 24) return 'atrasado'
  if (!ultimo.copiaDrive) return 'sem_drive'
  return 'em_dia'
}

// Há quantos dias de CALENDÁRIO (de Brasília) foi o backup — o número da
// frase "o último foi há 3 dias". Não é o mesmo corte do atraso, que é em
// horas: aqui é o que uma pessoa diria olhando o calendário.
export function diasDesdeOBackup(feitoEm: Date, agora: Date): number {
  return diasEntre(diaEmBrasilia(feitoEm), diaEmBrasilia(agora))
}

// "hoje, 09:02" · "ontem, 09:02" · "21/09, 09:02" — no fuso de Brasília.
export function quandoFoiOBackup(feitoEm: Date, agora: Date): string {
  const dias = diasDesdeOBackup(feitoEm, agora)
  const hora = horaEmBrasilia(feitoEm)
  if (dias === 0) return `hoje, ${hora}`
  if (dias === 1) return `ontem, ${hora}`
  const [, mes, dia] = diaEmBrasilia(feitoEm).split('-')
  return `${dia}/${mes}, ${hora}`
}

// "1,87 MB" — a mesma conta (1024²) que o script imprime no fim do backup.
export function tamanhoDoBackup(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MB`
}
