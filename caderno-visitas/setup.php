<?php
// Configuração inicial: confere o servidor, define a senha e cria o config.php.
// Só funciona enquanto o config.php NÃO existir. Para trocar a senha, apague
// o config.php pelo Gerenciador de Arquivos do cPanel e abra esta página de novo.
declare(strict_types=1);
define('CV_APP', true);

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$raiz = __DIR__;
$arqConfig = "$raiz/config.php";
$jaConfigurado = is_file($arqConfig);

$checks = [
    'PHP 8 ou mais novo' => PHP_VERSION_ID >= 80000,
    'PDO' => class_exists('PDO'),
    'pdo_sqlite (banco SQLite)' => extension_loaded('pdo_sqlite'),
    'pdo_mysql (alternativa MySQL)' => extension_loaded('pdo_mysql'),
    'fileinfo (validar imagens)' => class_exists('finfo'),
    'GD (regravar fotos) — opcional' => function_exists('imagecreatefromstring'),
    'Pasta data/ gravável' => is_writable("$raiz/data"),
    'Pasta uploads/ gravável' => is_writable("$raiz/uploads"),
    'Pasta do app gravável (para criar o config.php)' => is_writable($raiz),
];
$temSqlite = $checks['pdo_sqlite (banco SQLite)'];

$erro = '';
$ok = false;
if (!$jaConfigurado && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $senha = (string)($_POST['senha'] ?? '');
    $conf = (string)($_POST['confirmar'] ?? '');
    $driver = ($_POST['driver'] ?? 'sqlite') === 'mysql' ? 'mysql' : 'sqlite';
    if (mb_strlen($senha) < 8) {
        $erro = 'A senha precisa ter pelo menos 8 caracteres.';
    } elseif ($senha !== $conf) {
        $erro = 'As duas senhas não são iguais.';
    } else {
        if ($driver === 'sqlite') {
            $db = ['driver' => 'sqlite', 'path' => '__DIR__/data/caderno.sqlite'];
            $dsn = "sqlite:$raiz/data/caderno.sqlite";
            $u = $p = null;
        } else {
            $db = [
                'driver' => 'mysql',
                'host' => trim((string)($_POST['host'] ?? 'localhost')) ?: 'localhost',
                'name' => trim((string)($_POST['name'] ?? '')),
                'user' => trim((string)($_POST['user'] ?? '')),
                'pass' => (string)($_POST['pass'] ?? ''),
            ];
            $dsn = "mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4";
            $u = $db['user'];
            $p = $db['pass'];
        }
        try {
            $pdo = new PDO($dsn, $u, $p, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $pdo->query('SELECT 1');
        } catch (Throwable $e) {
            $erro = 'Não consegui conectar ao banco: ' . $e->getMessage();
        }
        if (!$erro) {
            $cfg = ['password_hash' => password_hash($senha, PASSWORD_DEFAULT), 'db' => $db];
            $php = "<?php\n// Gerado pelo setup.php em " . date('Y-m-d H:i') . ". Não versionar.\n"
                . "if (!defined('CV_APP')) { http_response_code(403); exit; }\n"
                . 'return ' . var_export($cfg, true) . ";\n";
            $php = str_replace("'__DIR__/data/caderno.sqlite'", "__DIR__ . '/data/caderno.sqlite'", $php);
            if (@file_put_contents($arqConfig, $php, LOCK_EX) === false) {
                $erro = 'Não consegui gravar o config.php. Confira a permissão da pasta (755).';
            } else {
                @chmod($arqConfig, 0600);
                $ok = true;
                $jaConfigurado = true;
            }
        }
    }
}
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Configurar — Caderno de Visitas</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f3f5f4;color:#1c2b27;margin:0;padding:16px}
  main{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
  h1{font-size:1.4rem;margin:0 0 12px}
  ul{list-style:none;padding:0;margin:0 0 16px}
  li{padding:6px 0;border-bottom:1px solid #eef1ef;display:flex;justify-content:space-between;gap:8px}
  .s{font-weight:700}.v{color:#0f7a55}.x{color:#c0392b}
  label{display:block;margin:12px 0 4px;font-weight:600}
  input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid #c9d3cf;border-radius:10px}
  button,.btn{display:block;width:100%;margin-top:18px;padding:14px;font-size:17px;font-weight:700;border:0;border-radius:12px;background:#0f6b5a;color:#fff;text-align:center;text-decoration:none}
  .erro{background:#fdecea;color:#8e2a1f;padding:10px;border-radius:10px}
  .ok{background:#e6f6ef;color:#0b5a40;padding:10px;border-radius:10px}
  fieldset{border:1px solid #dfe6e3;border-radius:12px;margin-top:14px}
</style>
</head>
<body><main>
<h1>Caderno de Visitas — configuração</h1>
<?php if ($ok): ?>
  <p class="ok">Pronto! Senha definida e banco criado.</p>
  <a class="btn" href="./">Abrir o app</a>
<?php elseif ($jaConfigurado): ?>
  <p class="ok">O app já está configurado.</p>
  <p>Para trocar a senha: apague o arquivo <b>config.php</b> pelo Gerenciador de Arquivos do cPanel e abra esta página de novo. Os imóveis e fotos não são apagados.</p>
  <a class="btn" href="./">Abrir o app</a>
<?php else: ?>
  <ul>
  <?php foreach ($checks as $nome => $passou): ?>
    <li><span><?= $h($nome) ?></span><span class="s <?= $passou ? 'v' : 'x' ?>"><?= $passou ? 'OK' : 'não' ?></span></li>
  <?php endforeach; ?>
  </ul>
  <?php if ($erro): ?><p class="erro"><?= $h($erro) ?></p><?php endif; ?>
  <form method="post" autocomplete="off">
    <label for="senha">Crie a senha do app (mínimo 8 caracteres)</label>
    <input id="senha" name="senha" type="password" required minlength="8">
    <label for="confirmar">Repita a senha</label>
    <input id="confirmar" name="confirmar" type="password" required minlength="8">
    <?php if ($temSqlite): ?>
      <input type="hidden" name="driver" value="sqlite">
      <p>Banco: <b>SQLite</b> (já disponível neste servidor, nada a criar no cPanel).</p>
    <?php else: ?>
      <input type="hidden" name="driver" value="mysql">
      <fieldset>
        <legend>Banco MySQL (este servidor não tem SQLite)</legend>
        <label for="name">Nome do banco</label><input id="name" name="name" required placeholder="usuario_caderno">
        <label for="user">Usuário do banco</label><input id="user" name="user" required placeholder="usuario_caderno">
        <label for="pass">Senha do usuário do banco</label><input id="pass" name="pass" type="password" required>
        <label for="host">Servidor</label><input id="host" name="host" value="localhost">
      </fieldset>
    <?php endif; ?>
    <button type="submit">Salvar configuração</button>
  </form>
<?php endif; ?>
</main></body>
</html>
