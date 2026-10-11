#!/usr/bin/env bash
#
# deploy.sh — testa, builda, confere e publica no document root da HostGator.
#
# Credenciais vêm de .env.deploy (fora do controle de versão).
# Nunca escreva senha aqui, no README ou em qualquer arquivo versionado.
#
# Uso: npm run deploy

set -euo pipefail

cd "$(dirname "$0")/.."

vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

abortar() {
  vermelho "✗ $*"
  exit 1
}

# ───────────────────────── 0. Credenciais ─────────────────────────

[ -f .env.deploy ] || abortar \
  "Falta o arquivo .env.deploy. Copie .env.deploy.example, preencha e tente de novo."

set -a
# shellcheck disable=SC1091
. ./.env.deploy
set +a

faltando=()
for chave in FTP_HOST FTP_USER FTP_PASS FTP_DIR SITE_URL; do
  [ -n "${!chave:-}" ] || faltando+=("$chave")
done
if [ ${#faltando[@]} -gt 0 ]; then
  abortar "Faltam estas chaves em .env.deploy: ${faltando[*]}"
fi

# O lftp vem do MSYS2 e não entra no PATH do Git Bash — por isso a procura
# no caminho padrão da instalação antes de desistir.
if command -v lftp >/dev/null 2>&1; then
  LFTP=lftp
elif [ -x /c/msys64/usr/bin/lftp.exe ]; then
  LFTP=/c/msys64/usr/bin/lftp.exe
else
  abortar "lftp não está instalado. No MSYS2: pacman -S lftp. Não há substituto seguro para o mirror --delete."
fi

# ───────────────────────── 1. Testes ─────────────────────────

passo "1/5 — Testes"
npm run test || abortar "Testes falharam. Nada foi publicado."
verde "✓ Todos os testes passaram"

# ───────────────────────── 2. Build ─────────────────────────

passo "2/5 — Build"
npm run build || abortar "Build falhou. Nada foi publicado."
verde "✓ Build gerado em dist/"

# ───────────────────────── 3. Conferência do dist ─────────────────────────

passo "3/5 — Conferindo o dist/"

[ -f dist/index.html ] || abortar "dist/index.html não foi gerado."
verde "✓ dist/index.html existe"

[ -f dist/parametros.json ] || abortar \
  "dist/parametros.json não existe. Ele vem de public/parametros.json — é o arquivo que se atualiza em janeiro sem recompilar."

node -e '
  const fs = require("fs");
  let p;
  try {
    p = JSON.parse(fs.readFileSync("dist/parametros.json", "utf8"));
  } catch (e) {
    console.error("dist/parametros.json não é JSON válido: " + e.message);
    process.exit(1);
  }
  if (!p.versao || !p.vigencia || !p.vigencia.inicio || !p.vigencia.fim) {
    console.error("dist/parametros.json sem versao/vigencia.");
    process.exit(1);
  }
  if (!p.inss || !p.irrf || !p.plr) {
    console.error("dist/parametros.json sem uma das tabelas (inss, irrf, plr).");
    process.exit(1);
  }
  const hoje = new Date().toISOString().slice(0, 10);
  console.log("  versao:   " + p.versao);
  console.log("  vigencia: " + p.vigencia.inicio + " a " + p.vigencia.fim);
  if (hoje > p.vigencia.fim) {
    console.log("\n  ATENÇÃO: as tabelas venceram em " + p.vigencia.fim + ".");
    console.log("  O app vai exibir o aviso de vigência. Atualize o parametros.json");
    console.log("  seguindo o checklist no rodapé de src/calc/parametros.ts.\n");
  }
' || abortar "dist/parametros.json reprovado."
verde "✓ dist/parametros.json é JSON válido e tem as tabelas"

[ -f dist/.htaccess ] || abortar \
  "dist/.htaccess não foi gerado. Ele vem de public/.htaccess e carrega o no-cache do parametros.json."
verde "✓ dist/.htaccess existe"

# ───────────────────────── 4. Envio por FTP ─────────────────────────

passo "4/5 — Enviando para ${FTP_HOST}:${FTP_DIR}"

# O document root PRECISA existir antes do mirror. Sem esta checagem, um
# FTP_DIR errado faria o lftp criar a pasta e publicar num lugar que ninguém
# serve — com --delete apagando o que estivesse lá.
"$LFTP" -c "
set cmd:fail-exit true
set ftp:ssl-allow ${FTP_SSL_ALLOW:-true}
set ssl:verify-certificate ${FTP_SSL_VERIFY:-false}
open '${FTP_HOST}'
user '${FTP_USER}' '${FTP_PASS}'
cd '${FTP_DIR}'
bye
" >/dev/null 2>&1 || abortar \
  "Não consegui entrar em '${FTP_DIR}' no servidor. Confira FTP_DIR, FTP_USER e FTP_PASS em .env.deploy — o document root tem de existir antes do deploy."

verde "✓ Document root ${FTP_DIR} existe e está acessível"

# --delete limpa assets antigos; -x preserva .well-known, senão o AutoSSL
# quebra na próxima renovação do certificado. O .ftpquota é criado pelo cPanel
# em toda conta FTP e o servidor recusa apagá-lo (553), o que derrubaria o
# mirror inteiro no fim — por isso ele também fica de fora.
"$LFTP" -c "
set cmd:fail-exit true
set ftp:ssl-allow ${FTP_SSL_ALLOW:-true}
set ssl:verify-certificate ${FTP_SSL_VERIFY:-false}
set net:max-retries 3
set net:timeout 20
open '${FTP_HOST}'
user '${FTP_USER}' '${FTP_PASS}'
mirror -R --delete --verbose \
  -x '^\.well-known/' \
  -x '^\.ftpquota$' \
  dist/ '${FTP_DIR}'
bye
" || abortar "Envio por FTP falhou."

verde "✓ Arquivos enviados"

# ───────────────────────── 5. Fim ─────────────────────────

passo "5/5 — Publicado"
verde "→ ${SITE_URL}"
echo
echo "Confira:"
echo "  curl -I ${SITE_URL}/"
echo "  curl -s ${SITE_URL}/parametros.json | head -5"
