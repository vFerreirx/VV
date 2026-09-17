import { redirect } from 'next/navigation'

// Clientes virou uma aba da tela de Pedidos (/pedidos?tab=clientes): o
// cadastro e os pedidos de cada cliente ficam juntos. Esta rota só leva pra
// lá, pra link antigo e favorito continuarem funcionando.
export default function ClientesPage() {
  redirect('/pedidos?tab=clientes')
}
