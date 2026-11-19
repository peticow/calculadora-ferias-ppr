<?php
// Núcleo do backend: configuração, banco, autenticação e utilidades.
declare(strict_types=1);

if (!defined('CV_APP')) {
    http_response_code(403);
    exit;
}

const CV_ROOT = __DIR__ . '/..';
const CV_TOKEN_DIAS = 90;
const CV_COOKIE = 'cv_token';
const CV_FOTO_MAX_BYTES = 10 * 1024 * 1024;
const CV_FOTO_MAX_LADO = 2000;

// Campos editáveis do imóvel => tipo.
const CV_CAMPOS = [
    'link' => 'url', 'corretor' => 'text', 'imobiliaria' => 'text', 'whatsapp' => 'text',
    'tipo' => 'enum', 'endereco' => 'text', 'bairro' => 'text',
    'aluguel' => 'num', 'condominio' => 'num', 'iptu' => 'num', 'taxa_lixo' => 'num',
    'quartos' => 'int', 'suites' => 'int', 'banheiros' => 'int', 'vagas' => 'int',
    'area' => 'num', 'andar' => 'int', 'elevador' => 'enum', 'mobiliado' => 'enum',
    'maps_link' => 'url', 'checklist' => 'json', 'minutos_terminal' => 'int', 'km_terminal' => 'num',
    'status' => 'enum', 'visita_em' => 'text', 'nota' => 'int',
    'motivo_descarte' => 'text', 'anotacoes' => 'longtext',
];

const CV_TIPOS = [
    'casa_edicula' => 'Casa com edícula/quarto externo',
    'casa' => 'Casa',
    'apto_baixo' => 'Apto térreo ou 1º andar',
    'apto_alto' => 'Apto outros andares',
];
const CV_STATUS = [
    'a_visitar' => 'A visitar', 'agendado' => 'Agendado', 'visitado' => 'Visitado',
    'descartado' => 'Descartado', 'proposta' => 'Proposta enviada', 'fechado' => 'Fechado',
];
const CV_ENUMS = [
    'tipo' => CV_TIPOS,
    'status' => CV_STATUS,
    'elevador' => ['sim' => 'Sim', 'nao' => 'Não'],
    'mobiliado' => ['nao' => 'Não', 'semi' => 'Semi', 'sim' => 'Sim'],
];
const CV_CHECKLIST = [
    'suite' => 'Suíte',
    'garagem_coberta' => 'Garagem coberta',
    'edicula' => 'Edícula ou quarto externo',
    'acesso_idoso' => 'Acesso sem degraus para idoso',
    'banheiro_idoso' => 'Banheiro adaptável para idoso',
    'tomadas_127v' => 'Tomadas e voltagem 127V ok',
    'ar_condicionado' => 'Ar-condicionado ou pontos de ar',
    'sol' => 'Sol',
    'rua_silenciosa' => 'Rua silenciosa',
    'sem_umidade' => 'Sem umidade ou infiltração',
    'pressao_agua' => 'Pressão da água boa',
    'sinal_celular' => 'Sinal de celular e internet',
    'rua_segura' => 'Rua segura',
];
const CV_CHECK_VALORES = ['sim' => 'Sim', 'nao' => 'Não', 'nao_vi' => 'Não vi'];
// Itens com opções próprias (os demais usam Sim / Não / Não vi).
const CV_CHECK_OPCOES = ['sol' => ['manha' => 'Manhã', 'tarde' => 'Tarde', 'nao_vi' => 'Não vi']];

function cv_check_opcoes(string $item): array
{
    return CV_CHECK_OPCOES[$item] ?? CV_CHECK_VALORES;
}

// Terminal HGT Aracruz (Imetame Porto, ES-010 km 58, Barra do Riacho).
const CV_TERMINAL = ['lat' => -19.8570848, 'lng' => -40.0749575];

function cv_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $arq = CV_ROOT . '/config.php';
        $cfg = is_file($arq) ? (require $arq) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $c = cv_config()['db'] ?? null;
    if (!$c) {
        throw new RuntimeException('App não configurado. Abra setup.php.');
    }
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (($c['driver'] ?? 'sqlite') === 'mysql') {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'] ?? 'localhost', $c['name']);
        $pdo = new PDO($dsn, $c['user'], $c['pass'], $opts);
        cv_migrar($pdo, 'mysql');
    } else {
        $caminho = $c['path'] ?? (CV_ROOT . '/data/caderno.sqlite');
        $pdo = new PDO('sqlite:' . $caminho, null, null, $opts);
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        cv_migrar($pdo, 'sqlite');
    }
    return $pdo;
}

function cv_driver(): string
{
    return (cv_config()['db']['driver'] ?? 'sqlite') === 'mysql' ? 'mysql' : 'sqlite';
}

function cv_migrar(PDO $pdo, string $driver): void
{
    $my = $driver === 'mysql';
    $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $sufixo = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $tipos = [
        'url' => 'TEXT', 'text' => 'TEXT', 'longtext' => $my ? 'MEDIUMTEXT' : 'TEXT',
        'enum' => 'VARCHAR(30)', 'num' => $my ? 'DOUBLE' : 'REAL', 'int' => 'INTEGER', 'json' => 'TEXT',
    ];
    $cols = [];
    foreach (CV_CAMPOS as $nome => $tipo) {
        $cols[] = "$nome {$tipos[$tipo]} NULL";
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS imoveis (
        id $pk,
        codigo VARCHAR(20) NOT NULL UNIQUE,
        ordem INTEGER NOT NULL DEFAULT 0,
        capa_foto_id INTEGER NULL,
        criado_em VARCHAR(25) NOT NULL,
        atualizado_em VARCHAR(25) NOT NULL,
        " . implode(",\n        ", $cols) . "
    )$sufixo");
    // Campos acrescentados depois da criação do banco: adiciona a coluna que faltar.
    $existentes = [];
    $sql = $my ? 'SHOW COLUMNS FROM imoveis' : 'PRAGMA table_info(imoveis)';
    foreach ($pdo->query($sql) as $c) {
        $existentes[strtolower($c[$my ? 'Field' : 'name'])] = true;
    }
    foreach (CV_CAMPOS as $nome => $tipo) {
        if (!isset($existentes[$nome])) {
            $pdo->exec("ALTER TABLE imoveis ADD COLUMN $nome {$tipos[$tipo]} NULL");
        }
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS fotos (
        id $pk,
        imovel_id INTEGER NOT NULL,
        arquivo VARCHAR(64) NOT NULL,
        client_uid VARCHAR(64) NULL UNIQUE,
        criado_em VARCHAR(25) NOT NULL
    )$sufixo");
    $pdo->exec("CREATE TABLE IF NOT EXISTS tokens (
        hash CHAR(64) NOT NULL PRIMARY KEY,
        expira INTEGER NOT NULL
    )$sufixo");
    $pdo->exec("CREATE TABLE IF NOT EXISTS meta (
        chave VARCHAR(50) NOT NULL PRIMARY KEY,
        valor TEXT NULL
    )$sufixo");
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_falhas (
        ip VARCHAR(64) NOT NULL,
        momento INTEGER NOT NULL
    )$sufixo");
}

function cv_agora(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d H:i:s');
}

// ───────────── HTTP ─────────────

function cv_json($dados, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cv_erro(string $msg, int $status = 400): void
{
    cv_json(['erro' => $msg], $status);
}

function cv_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

function cv_base_dir(): string
{
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return rtrim($dir, '/') . '/';
}

function cv_base_url(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (cv_https() ? 'https' : 'http') . '://' . $host . cv_base_dir();
}

function cv_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '?'), 0, 64);
}

// ───────────── Autenticação (token persistente, 90 dias) ─────────────

function cv_set_cookie(string $valor, int $expira): void
{
    setcookie(CV_COOKIE, $valor, [
        'expires' => $expira,
        'path' => cv_base_dir(),
        'secure' => cv_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function cv_autenticado(): bool
{
    $t = $_COOKIE[CV_COOKIE] ?? '';
    if (!is_string($t) || !preg_match('/^[a-f0-9]{64}$/', $t)) {
        return false;
    }
    $hash = hash('sha256', $t);
    $st = db()->prepare('SELECT expira FROM tokens WHERE hash = ?');
    $st->execute([$hash]);
    $expira = $st->fetchColumn();
    if ($expira === false || (int)$expira < time()) {
        return false;
    }
    // Renova a validade (sessão deslizante) no máximo uma vez por dia.
    $nova = time() + CV_TOKEN_DIAS * 86400;
    if ($nova - (int)$expira > 86400) {
        db()->prepare('UPDATE tokens SET expira = ? WHERE hash = ?')->execute([$nova, $hash]);
        cv_set_cookie($t, $nova);
    }
    return true;
}

function cv_login(string $senha): void
{
    $pdo = db();
    $ip = cv_ip();
    $janela = time() - 15 * 60;
    $pdo->prepare('DELETE FROM login_falhas WHERE momento < ?')->execute([$janela]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM login_falhas WHERE ip = ?');
    $st->execute([$ip]);
    if ((int)$st->fetchColumn() >= 10) {
        cv_erro('Muitas tentativas. Espere 15 minutos.', 429);
    }
    $hash = (string)(cv_config()['password_hash'] ?? '');
    if ($hash === '' || !password_verify($senha, $hash)) {
        $pdo->prepare('INSERT INTO login_falhas (ip, momento) VALUES (?, ?)')->execute([$ip, time()]);
        usleep(400000);
        cv_erro('Senha incorreta.', 401);
    }
    $pdo->prepare('DELETE FROM tokens WHERE expira < ?')->execute([time()]);
    $token = bin2hex(random_bytes(32));
    $expira = time() + CV_TOKEN_DIAS * 86400;
    $pdo->prepare('INSERT INTO tokens (hash, expira) VALUES (?, ?)')->execute([hash('sha256', $token), $expira]);
    cv_set_cookie($token, $expira);
}

function cv_logout(): void
{
    $t = $_COOKIE[CV_COOKIE] ?? '';
    if (is_string($t) && $t !== '') {
        db()->prepare('DELETE FROM tokens WHERE hash = ?')->execute([hash('sha256', $t)]);
    }
    cv_set_cookie('', time() - 3600);
}
