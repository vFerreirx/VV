// O <ViewTransition> só existe no canal canary/experimental do React — que é
// justamente o que o Next passa a usar com `experimental.viewTransition`.
// Os tipos, porém, ficam num arquivo à parte do @types/react e precisam ser
// puxados na mão; sem isso o tsc não conhece o componente.
/// <reference types="react/canary" />

export {}
