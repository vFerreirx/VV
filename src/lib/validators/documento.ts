// Helpers puros de CPF/CNPJ e CEP — sem I/O, usados tanto pelo formulário
// (cliente) quanto pelo validator zod (servidor).
//
// CNPJ ALFANUMÉRICO: desde julho/2026 as 12 primeiras posições do CNPJ podem
// ter letras; os 2 dígitos verificadores continuam numéricos. O cálculo do DV
// é o mesmo de sempre, só que o "valor" de cada caractere passa a ser o código
// ASCII menos 48 ('0'→0 … '9'→9, 'A'→17 … 'Z'→42). Pra um CNPJ 100% numérico
// isso cai exatamente no algoritmo clássico, então uma implementação cobre os
// dois formatos.

export function soDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

// Normalização guardada no banco: sem pontuação, em maiúsculas.
export function normalizarDocumento(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export type TipoDocumento = 'cpf' | 'cnpj'

// CPF só existe numérico; 14 posições (com ou sem letra) é CNPJ.
export function tipoDocumento(v: string): TipoDocumento | null {
  const d = normalizarDocumento(v)
  if (/^\d{11}$/.test(d)) return 'cpf'
  if (d.length === 14) return 'cnpj'
  return null
}

export function validarCpf(v: string): boolean {
  const d = soDigitos(v)
  if (d.length !== 11) return false
  // Sequência toda igual ("111.111.111-11") fecha o DV mas não é CPF.
  if (/^(\d)\1{10}$/.test(d)) return false

  const dv = (len: number): number => {
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function validarCnpj(v: string): boolean {
  const d = normalizarDocumento(v)
  // 12 posições alfanuméricas + 2 DVs sempre numéricos.
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d)) return false
  // Sequência toda igual fecha o DV mas não é CNPJ.
  if (/^(.)\1{11}$/.test(d.slice(0, 12))) return false

  const dv = (len: number): number => {
    let soma = 0
    let peso = 2
    for (let i = len - 1; i >= 0; i--) {
      soma += (d.charCodeAt(i) - 48) * peso
      peso = peso === 9 ? 2 : peso + 1
    }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

export function documentoValido(v: string): boolean {
  const tipo = tipoDocumento(v)
  if (tipo === 'cpf') return validarCpf(v)
  if (tipo === 'cnpj') return validarCnpj(v)
  return false
}

// Exibição: 000.000.000-00 ou 00.000.000/0000-00 (serve pro alfanumérico).
export function formatarDocumento(v: string | null | undefined): string {
  if (!v) return ''
  const d = normalizarDocumento(v)
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  return d
}

// Máscara progressiva do input: com letra só pode ser CNPJ; sem letra, até 11
// caracteres ainda pode ser CPF.
export function mascararDocumento(v: string): string {
  const d = normalizarDocumento(v).slice(0, 14)
  const comoCnpj = /[A-Z]/.test(d) || d.length > 11

  if (!comoCnpj) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }
  const c = '[0-9A-Z]'
  return d
    .replace(new RegExp(`^(${c}{2})(${c})`), '$1.$2')
    .replace(new RegExp(`^(${c}{2})\\.(${c}{3})(${c})`), '$1.$2.$3')
    .replace(new RegExp(`^(${c}{2})\\.(${c}{3})\\.(${c}{3})(${c})`), '$1.$2.$3/$4')
    .replace(
      new RegExp(`^(${c}{2})\\.(${c}{3})\\.(${c}{3})/(${c}{4})(${c})`),
      '$1.$2.$3/$4-$5',
    )
}

export function mascararCep(v: string): string {
  return soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')
}

export function formatarCep(v: string | null | undefined): string {
  if (!v) return ''
  const d = soDigitos(v)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
] as const
