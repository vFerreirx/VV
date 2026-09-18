import { redirect } from 'next/navigation'

// Os kits viraram aba dentro de /produtos — kit é combinação de produto, e as
// duas telas já dividiam a MESMA área de permissão.
//
// A rota fica de pé (e não vira 404) porque ela está em link e em favorito de
// gente que usa o sistema todo dia; mesma escolha do /relatorios.
//
// ⚠️ `kits/actions.ts` CONTINUA: `listarKitsComItens` é importado pela página
// do pedido e agora também por /produtos. O que saiu daqui foi a tela.
export default function KitsPage() {
  redirect('/produtos?tab=kits')
}
