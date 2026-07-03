# Testes E2E (Playwright)

Suíte de **smoke tests read-only**: navega pelas páginas principais e
confere que a estrutura renderiza. **Não cria nem altera dados.**

## Como rodar

Os testes autenticados só rodam com credenciais via ambiente — sem elas,
são pulados (proteção pra ninguém rodar contra produção sem querer):

```bash
E2E_USERNAME=seuusuario E2E_PASSWORD=suasenha npx playwright test
```

No PowerShell:

```powershell
$env:E2E_USERNAME='seuusuario'; $env:E2E_PASSWORD='suasenha'; npx playwright test
```

## Importante

- O dev server usa o Supabase de `.env.local`. Se esse for o banco de
  **produção**, os testes rodam contra produção — os specs são read-only,
  mas o ideal é apontar pra um projeto Supabase de teste.
- Use um usuário com papel **admin** (os smoke tests visitam todas as
  páginas).
- Specs antigos que dependiam de dados seedados (`MAL-001`, usuários
  `Senha123!`) foram removidos — o seed não reflete mais o banco real.
