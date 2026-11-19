# Caderno de Visitas

PWA para prospecção de imóveis para alugar em Aracruz/ES.
HTML/CSS/JS puro + API PHP 8 (`api.php`) com SQLite (ou MySQL) via PDO.

- `setup.php` — primeira configuração: confere o servidor, cria a senha e o `config.php`.
- `config.php`, `data/` e `uploads/*` nunca vão para o Git.
- Deploy: `.github/workflows/deploy-caderno.yml` (FTP para a HostGator).
- Esqueceu a senha: apague `config.php` no Gerenciador de Arquivos do cPanel e abra `setup.php` de novo (os dados ficam).
