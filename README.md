# Acompanhamento Integral

Aplicação Node para acompanhamento volitivo, afetivo e cognitivo dos alunos, inspirada na educação personalizada de Victor García Hoz e nos princípios da educação clássica católica.

## Recursos

- Cadastro de alunos por nome, turma e professora responsável.
- Checklist com 37 indicadores: volitivo, afetivo e cognitivo.
- Observações por indicador, fotos/evidências comprimidas no navegador e síntese pedagógica.
- Persistência em MySQL.
- Dashboard com totais, médias por aspecto e pontos de atenção.
- Layout responsivo inspirado no material visual do Colégio Farol.
- Exportação CSV da lista filtrada e impressão/PDF do preenchimento pelo navegador.
- PWA instalável, com manifesto, service worker e aviso de instalação.

## Configuração

1. Instale as dependências:

```bash
npm install
```

2. Crie o banco e as tabelas no MySQL:

```bash
mysql -u root -p < schema.sql
```

3. Crie um arquivo `.env` a partir de `.env.example` e preencha os dados do MySQL:

```env
PORT=3000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=sua_senha
MYSQL_DATABASE=acompanhamento_integral
```

4. Inicie o servidor:

```bash
npm start
```

Depois acesse `http://localhost:3000`.

## PWA

O app pode ser instalado pelo navegador. Ao abrir a aplicação, aparece um aviso "Instale o app"; quando o navegador oferecer suporte, o botão `Instalar` abre o prompt nativo de instalação. O service worker mantém os arquivos estáticos em cache para abertura mais rápida.

## Login

Na primeira execução, o sistema cria automaticamente um usuário padrão se ele ainda não existir:

```text
E-mail: admin@farol.local
Senha: farol123
```

Para trocar o acesso inicial, defina no `.env`:

```env
AUTH_EMAIL=seu-email@colegio.com
AUTH_PASSWORD=sua_senha
AUTH_NAME=Nome exibido
```

## Observação

Se aparecer a mensagem "Não foi possível conectar ao MySQL", confira se o banco foi criado com `schema.sql` e se usuário, senha, host e porta do `.env` estão corretos.
