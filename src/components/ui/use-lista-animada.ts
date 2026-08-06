'use client'

import { useAutoAnimate } from '@formkit/auto-animate/react'

// Entra/sai/reordena de lista, animado. Um único ponto de ajuste pra todas
// as listas do app.
//
// 180ms (o padrão da lib é 250): é chão de fábrica, e aqui lentidão
// percebida é pior que não ter animação nenhuma.
//
// Não tem guarda de prefers-reduced-motion aqui de propósito — o
// auto-animate já checa a preferência por conta própria e só ignora ela se
// a gente passar `disrespectUserMotionPreference`, o que não fazemos.
export function useListaAnimada<T extends Element>() {
  return useAutoAnimate<T>({ duration: 180, easing: 'ease-out' })
}
