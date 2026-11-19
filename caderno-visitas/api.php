<?php
// API REST (JSON) do Caderno de Visitas. Rotas via ?r=recurso/id/acao.
declare(strict_types=1);
define('CV_APP', true);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/distancia.php';

set_exception_handler(function (Throwable $e) {
    error_log('[caderno-visitas] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    cv_erro($e instanceof RuntimeException ? $e->getMessage() : 'Erro interno no servidor.', 500);
});

if (!cv_config()) {
    cv_erro('App ainda não configurado. Abra setup.php.', 503);
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$partes = array_values(array_filter(explode('/', trim((string)($_GET['r'] ?? ''), '/')), 'strlen'));
$recurso = $partes[0] ?? '';
$id = isset($partes[1]) && ctype_digit($partes[1]) ? (int)$partes[1] : null;
$acao = $partes[2] ?? null;

// Proteção CSRF: toda escrita exige o cabeçalho X-CV (navegadores não o
// enviam de outro site sem preflight CORS, que esta API não autoriza).
if ($metodo !== 'GET' && ($_SERVER['HTTP_X_CV'] ?? '') !== '1') {
    cv_erro('Requisição recusada.', 403);
}

function corpo(): array
{
    $dados = json_decode((string)file_get_contents('php://input'), true);
    return is_array($dados) ? $dados : [];
}

// ───────── Rotas públicas ─────────
if ($recurso === 'login' && $metodo === 'POST') {
    cv_login((string)(corpo()['senha'] ?? ''));
    cv_json(['ok' => true]);
}
if ($recurso === 'logout' && $metodo === 'POST') {
    cv_logout();
    cv_json(['ok' => true]);
}
if ($recurso === 'sessao' && $metodo === 'GET') {
    cv_json(['autenticado' => cv_autenticado()]);
}

if (!cv_autenticado()) {
    cv_erro('Faça login.', 401);
}

// ───────── Imóveis ─────────

function validar(array $in): array
{
    $saida = [];
    foreach (CV_CAMPOS as $campo => $tipo) {
        if (!array_key_exists($campo, $in)) {
            continue;
        }
        $v = $in[$campo];
        if ($v === '' || $v === null) {
            $saida[$campo] = null;
            continue;
        }
        switch ($tipo) {
            case 'url':
                $v = trim((string)$v);
                if (!preg_match('~^https?://~i', $v) || strlen($v) > 2000) {
                    cv_erro("O campo \"$campo\" precisa ser um link começando com http:// ou https://.");
                }
                break;
            case 'text':
                $v = mb_substr(trim((string)$v), 0, 2000);
                break;
            case 'longtext':
                $v = mb_substr((string)$v, 0, 100000);
                break;
            case 'enum':
                $v = (string)$v;
                if (!isset(CV_ENUMS[$campo][$v])) {
                    cv_erro("Valor inválido em \"$campo\".");
                }
                break;
            case 'num':
                if (!is_numeric($v) || $v < 0 || $v > 1e9) {
                    cv_erro("Número inválido em \"$campo\".");
                }
                $v = round((float)$v, 2);
                break;
            case 'int':
                if (!is_numeric($v) || $v < 0 || $v > 100000) {
                    cv_erro("Número inválido em \"$campo\".");
                }
                $v = (int)$v;
                break;
            case 'json':
                $limpo = [];
                foreach ((array)$v as $k => $val) {
                    if (isset(CV_CHECKLIST[$k]) && is_string($val) && isset(cv_check_opcoes($k)[$val])) {
                        $limpo[$k] = $val;
                    }
                }
                $v = $limpo ? json_encode($limpo) : null;
                break;
        }
        $saida[$campo] = $v;
    }
    if (isset($saida['nota']) && $saida['nota'] > 5) {
        cv_erro('A nota vai de 1 a 5.');
    }
    if (array_key_exists('visita_em', $saida) && $saida['visita_em'] !== null
        && !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/', $saida['visita_em'])) {
        cv_erro('Data da visita inválida.');
    }
    return $saida;
}

function fotos_de(array $ids): array
{
    if (!$ids) {
        return [];
    }
    $marc = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT id, imovel_id, arquivo FROM fotos WHERE imovel_id IN ($marc) ORDER BY id");
    $st->execute($ids);
    $por = [];
    foreach ($st as $f) {
        $por[(int)$f['imovel_id']][] = ['id' => (int)$f['id'], 'url' => 'uploads/' . $f['arquivo'], 'tipo' => cv_tipo_arquivo($f['arquivo'])];
    }
    return $por;
}

function formatar(array $r, array $fotos): array
{
    $out = [
        'id' => (int)$r['id'], 'codigo' => $r['codigo'], 'ordem' => (int)$r['ordem'],
        'criado_em' => $r['criado_em'], 'atualizado_em' => $r['atualizado_em'],
    ];
    foreach (CV_CAMPOS as $campo => $tipo) {
        $v = $r[$campo];
        if ($v !== null) {
            if ($tipo === 'num') {
                $v = (float)$v;
            } elseif ($tipo === 'int') {
                $v = (int)$v;
            } elseif ($tipo === 'json') {
                $v = json_decode($v, true) ?: [];
            }
        }
        $out[$campo] = $v;
    }
    if ($out['checklist'] === null) {
        $out['checklist'] = [];
    }
    // Versão antiga do checklist: "Sol da manhã = Sim" vira "Sol = Manhã".
    if (isset($out['checklist']['sol_manha'])) {
        if ($out['checklist']['sol_manha'] === 'sim' && !isset($out['checklist']['sol'])) {
            $out['checklist']['sol'] = 'manha';
        }
        unset($out['checklist']['sol_manha']);
    }
    // Total mensal: a taxa de lixo é anual, entra dividida por 12.
    $out['total'] = round((float)$out['aluguel'] + (float)$out['condominio'] + (float)$out['iptu'] + (float)$out['taxa_lixo'] / 12, 2);
    $out['fotos'] = $fotos;
    $capaId = $r['capa_foto_id'] !== null ? (int)$r['capa_foto_id'] : null;
    $capa = null;
    $soFotos = array_values(array_filter($fotos, fn($f) => $f['tipo'] === 'foto'));
    foreach ($soFotos as $f) {
        if ($f['id'] === $capaId) {
            $capa = $f;
        }
    }
    $capa = $capa ?? ($soFotos[0] ?? null);
    $out['capa_foto_id'] = $capa['id'] ?? null;
    $out['capa_url'] = $capa['url'] ?? null;
    return $out;
}

function listar(): array
{
    $linhas = db()->query('SELECT * FROM imoveis ORDER BY ordem, id')->fetchAll();
    $fotos = fotos_de(array_map(fn($r) => (int)$r['id'], $linhas));
    return array_map(fn($r) => formatar($r, $fotos[(int)$r['id']] ?? []), $linhas);
}

function buscar(int $id): array
{
    $st = db()->prepare('SELECT * FROM imoveis WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) {
        cv_erro('Imóvel não encontrado.', 404);
    }
    return formatar($r, fotos_de([$id])[$id] ?? []);
}

function proximo_codigo(PDO $pdo): string
{
    $st = $pdo->query("SELECT valor FROM meta WHERE chave = 'proximo_codigo'");
    $n = $st->fetchColumn();
    if ($n === false) {
        // Primeiro uso: parte do maior código existente (nunca reaproveita).
        $max = 0;
        foreach ($pdo->query('SELECT codigo FROM imoveis') as $r) {
            $max = max($max, (int)preg_replace('/\D/', '', $r['codigo']));
        }
        $n = $max + 1;
        $pdo->prepare("INSERT INTO meta (chave, valor) VALUES ('proximo_codigo', ?)")->execute([(string)($n + 1)]);
    } else {
        $n = (int)$n;
        $pdo->prepare("UPDATE meta SET valor = ? WHERE chave = 'proximo_codigo'")->execute([(string)($n + 1)]);
    }
    return 'AR-' . str_pad((string)$n, 2, '0', STR_PAD_LEFT);
}

function criar(array $dados): array
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $codigo = proximo_codigo($pdo);
        $ordem = (int)$pdo->query('SELECT COALESCE(MAX(ordem), 0) + 1 FROM imoveis')->fetchColumn();
        $dados['status'] = $dados['status'] ?? 'a_visitar';
        $agora = cv_agora();
        $cols = array_merge(['codigo', 'ordem', 'criado_em', 'atualizado_em'], array_keys($dados));
        $vals = array_merge([$codigo, $ordem, $agora, $agora], array_values($dados));
        $marc = implode(',', array_fill(0, count($cols), '?'));
        $pdo->prepare('INSERT INTO imoveis (' . implode(',', $cols) . ") VALUES ($marc)")->execute($vals);
        $id = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return buscar($id);
}

function atualizar(int $id, array $dados): array
{
    buscar($id);
    $dados['atualizado_em'] = cv_agora();
    $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($dados)));
    $vals = array_values($dados);
    $vals[] = $id;
    db()->prepare("UPDATE imoveis SET $sets WHERE id = ?")->execute($vals);
    return buscar($id);
}

function excluir_imovel(int $id): void
{
    buscar($id);
    $pdo = db();
    $st = $pdo->prepare('SELECT arquivo FROM fotos WHERE imovel_id = ?');
    $st->execute([$id]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $arq) {
        @unlink(CV_ROOT . '/uploads/' . basename($arq));
    }
    $pdo->prepare('DELETE FROM fotos WHERE imovel_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM imoveis WHERE id = ?')->execute([$id]);
}

function salvar_ordem(array $ids): void
{
    $pdo = db();
    $existentes = $pdo->query('SELECT id FROM imoveis ORDER BY ordem, id')->fetchAll(PDO::FETCH_COLUMN);
    $existentes = array_map('intval', $existentes);
    $pedido = [];
    foreach ($ids as $i) {
        $i = (int)$i;
        if (in_array($i, $existentes, true) && !in_array($i, $pedido, true)) {
            $pedido[] = $i;
        }
    }
    // Quem não veio na lista (ex.: criado em outro aparelho) vai para o fim.
    foreach ($existentes as $i) {
        if (!in_array($i, $pedido, true)) {
            $pedido[] = $i;
        }
    }
    $pdo->beginTransaction();
    $st = $pdo->prepare('UPDATE imoveis SET ordem = ? WHERE id = ?');
    foreach ($pedido as $pos => $i) {
        $st->execute([$pos + 1, $i]);
    }
    $pdo->commit();
}

// ───────── Fotos ─────────

function receber_foto(int $imovelId): array
{
    buscar($imovelId);
    $uid = (string)($_POST['uid'] ?? '');
    if ($uid !== '' && !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $uid)) {
        cv_erro('Identificador de foto inválido.');
    }
    $pdo = db();
    if ($uid !== '') {
        $st = $pdo->prepare('SELECT id, arquivo, imovel_id FROM fotos WHERE client_uid = ?');
        $st->execute([$uid]);
        if ($ja = $st->fetch()) { // reenvio da mesma foto: não duplica
            return ['id' => (int)$ja['id'], 'url' => 'uploads/' . $ja['arquivo'], 'tipo' => cv_tipo_arquivo($ja['arquivo'])];
        }
    }
    $f = $_FILES['foto'] ?? null;
    if (!$f || !is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $codigo = $f['error'] ?? null;
        if ($codigo === UPLOAD_ERR_INI_SIZE || $codigo === UPLOAD_ERR_FORM_SIZE || empty($_FILES)) {
            cv_erro('Foto grande demais.', 413);
        }
        cv_erro('Nenhuma foto recebida.');
    }
    if ($f['size'] > CV_FOTO_MAX_BYTES) {
        cv_erro('Foto grande demais (máximo 10 MB).', 413);
    }
    if (!is_uploaded_file($f['tmp_name'])) {
        cv_erro('Envio inválido.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($exts[$mime])) {
        cv_erro('Formato não aceito. Envie JPEG, PNG ou WebP.', 415);
    }
    $info = @getimagesize($f['tmp_name']);
    if (!$info || $info[0] < 1 || $info[1] < 1 || $info[0] > 12000 || $info[1] > 12000) {
        cv_erro('O arquivo não é uma imagem válida.', 415);
    }
    $nome = bin2hex(random_bytes(12));
    $dir = CV_ROOT . '/uploads';
    // Se o servidor tiver GD, regrava a imagem como JPEG: limita o tamanho e
    // descarta qualquer conteúdo que não seja pixel.
    $img = function_exists('imagecreatefromstring') ? @imagecreatefromstring((string)file_get_contents($f['tmp_name'])) : false;
    if ($img) {
        $w = imagesx($img);
        $h = imagesy($img);
        $esc = min(1, CV_FOTO_MAX_LADO / max($w, $h));
        if ($esc < 1) {
            $nw = (int)round($w * $esc);
            $nh = (int)round($h * $esc);
            $nova = imagecreatetruecolor($nw, $nh);
            imagecopyresampled($nova, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($img);
            $img = $nova;
        }
        $arquivo = "$nome.jpg";
        if (!imagejpeg($img, "$dir/$arquivo", 85)) {
            throw new RuntimeException('Não consegui gravar a foto no servidor.');
        }
        imagedestroy($img);
    } else {
        $arquivo = "$nome." . $exts[$mime];
        if (!move_uploaded_file($f['tmp_name'], "$dir/$arquivo")) {
            throw new RuntimeException('Não consegui gravar a foto no servidor.');
        }
    }
    @chmod("$dir/$arquivo", 0644);
    $pdo->prepare('INSERT INTO fotos (imovel_id, arquivo, client_uid, criado_em) VALUES (?, ?, ?, ?)')
        ->execute([$imovelId, $arquivo, $uid !== '' ? $uid : null, cv_agora()]);
    return ['id' => (int)$pdo->lastInsertId(), 'url' => "uploads/$arquivo", 'tipo' => 'foto'];
}

/**
 * Vídeo chega em partes de até 2 MB (cabe em qualquer limite de envio da hospedagem
 * e retoma de onde parou se o sinal cair). As partes ficam em data/ (bloqueada na web)
 * e só vão para uploads/ depois de juntas e conferidas.
 */
function receber_parte_video(int $imovelId): array
{
    buscar($imovelId);
    $uid = (string)($_POST['uid'] ?? '');
    $parte = (int)($_POST['parte'] ?? -1);
    $total = (int)($_POST['total'] ?? 0);
    if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $uid) || $parte < 0 || $total < 1 || $parte >= $total
        || $total * CV_VIDEO_PARTE > CV_VIDEO_MAX_BYTES + CV_VIDEO_PARTE) {
        cv_erro($total * CV_VIDEO_PARTE > CV_VIDEO_MAX_BYTES ? 'Vídeo grande demais (máximo 300 MB).' : 'Parte de vídeo inválida.', 413);
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT id, arquivo FROM fotos WHERE client_uid = ?');
    $st->execute([$uid]);
    if ($ja = $st->fetch()) { // já foi montado antes: reenvio
        return ['pronto' => true, 'foto' => ['id' => (int)$ja['id'], 'url' => 'uploads/' . $ja['arquivo'], 'tipo' => 'video']];
    }
    $dirTmp = CV_ROOT . '/data/partes';
    if (!is_dir($dirTmp)) {
        @mkdir($dirTmp, 0755, true);
    }
    foreach (glob("$dirTmp/*.part") ?: [] as $velho) { // limpa envios abandonados
        if (filemtime($velho) < time() - 3 * 86400) {
            @unlink($velho);
        }
    }
    $tmp = "$dirTmp/$uid.part";
    clearstatcache();
    $tamanho = is_file($tmp) ? filesize($tmp) : 0;
    $esperada = intdiv($tamanho, CV_VIDEO_PARTE);
    if ($parte < $esperada) { // parte repetida (resposta anterior se perdeu)
        return ['pronto' => false, 'proxima' => $esperada];
    }
    if ($parte > $esperada || $tamanho % CV_VIDEO_PARTE !== 0) {
        cv_json(['erro' => 'Fora de ordem.', 'proxima' => $esperada], 409);
    }
    $f = $_FILES['arquivo'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        cv_erro('Parte do vídeo não recebida.', empty($_FILES) ? 413 : 400);
    }
    if ($f['size'] > CV_VIDEO_PARTE || ($parte < $total - 1 && $f['size'] !== CV_VIDEO_PARTE)) {
        cv_erro('Tamanho de parte inválido.');
    }
    $dados = file_get_contents($f['tmp_name']);
    if (file_put_contents($tmp, $dados, FILE_APPEND | LOCK_EX) === false) {
        throw new RuntimeException('Não consegui gravar o vídeo no servidor.');
    }
    if ($parte < $total - 1) {
        return ['pronto' => false, 'proxima' => $parte + 1];
    }
    // Última parte: confere o tipo real do arquivo montado.
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $exts = ['video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm', 'video/3gpp' => '3gp', 'video/x-m4v' => 'mp4'];
    if (!isset($exts[$mime])) {
        @unlink($tmp);
        cv_erro('Formato de vídeo não aceito. Envie MP4, MOV ou WebM.', 415);
    }
    $arquivo = bin2hex(random_bytes(12)) . '.' . $exts[$mime];
    if (!rename($tmp, CV_ROOT . "/uploads/$arquivo")) {
        throw new RuntimeException('Não consegui gravar o vídeo no servidor.');
    }
    @chmod(CV_ROOT . "/uploads/$arquivo", 0644);
    $pdo->prepare('INSERT INTO fotos (imovel_id, arquivo, client_uid, criado_em) VALUES (?, ?, ?, ?)')
        ->execute([$imovelId, $arquivo, $uid, cv_agora()]);
    return ['pronto' => true, 'foto' => ['id' => (int)$pdo->lastInsertId(), 'url' => "uploads/$arquivo", 'tipo' => 'video']];
}

function excluir_foto(int $fotoId): void
{
    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM fotos WHERE id = ?');
    $st->execute([$fotoId]);
    $f = $st->fetch();
    if (!$f) {
        cv_erro('Foto não encontrada.', 404);
    }
    @unlink(CV_ROOT . '/uploads/' . basename($f['arquivo']));
    $pdo->prepare('DELETE FROM fotos WHERE id = ?')->execute([$fotoId]);
    $pdo->prepare('UPDATE imoveis SET capa_foto_id = NULL WHERE capa_foto_id = ?')->execute([$fotoId]);
}

// ───────── Exportação ─────────

function exportar(string $formato): void
{
    $base = cv_base_url();
    $itens = listar();
    $data = date('Y-m-d');
    $saida = [];
    foreach ($itens as $pos => $i) {
        $check = [];
        foreach (CV_CHECKLIST as $k => $rot) {
            $check[$rot] = isset($i['checklist'][$k]) ? (cv_check_opcoes($k)[$i['checklist'][$k]] ?? '') : '';
        }
        $saida[] = [
            'codigo' => $i['codigo'],
            'prioridade' => $pos + 1,
            'status' => CV_STATUS[$i['status']] ?? '',
            'tipo' => CV_TIPOS[$i['tipo']] ?? '',
            'bairro' => $i['bairro'],
            'endereco' => $i['endereco'],
            'aluguel' => $i['aluguel'],
            'condominio' => $i['condominio'],
            'iptu' => $i['iptu'],
            'taxa_lixo_ano' => $i['taxa_lixo'],
            'total_mensal' => $i['total'],
            'quartos' => $i['quartos'], 'suites' => $i['suites'], 'banheiros' => $i['banheiros'],
            'vagas' => $i['vagas'], 'area_m2' => $i['area'],
            'andar' => $i['andar'],
            'elevador' => CV_ENUMS['elevador'][$i['elevador']] ?? '',
            'mobiliado' => CV_ENUMS['mobiliado'][$i['mobiliado']] ?? '',
            'checklist' => $check,
            'minutos_ate_terminal' => $i['minutos_terminal'],
            'km_ate_terminal' => $i['km_terminal'],
            'visita_em' => $i['visita_em'] ? str_replace('T', ' ', $i['visita_em']) : null,
            'nota' => $i['nota'],
            'motivo_descarte' => $i['motivo_descarte'],
            'corretor' => $i['corretor'], 'imobiliaria' => $i['imobiliaria'], 'whatsapp' => $i['whatsapp'],
            'link_anuncio' => $i['link'],
            'link_maps' => $i['maps_link'],
            'anotacoes' => $i['anotacoes'],
            'fotos' => array_values(array_map(fn($f) => $base . $f['url'], array_filter($i['fotos'], fn($f) => $f['tipo'] === 'foto'))),
            'videos' => array_values(array_map(fn($f) => $base . $f['url'], array_filter($i['fotos'], fn($f) => $f['tipo'] === 'video'))),
            'capa' => $i['capa_url'] ? $base . $i['capa_url'] : null,
            'criado_em' => $i['criado_em'],
            'atualizado_em' => $i['atualizado_em'],
        ];
    }
    header('Cache-Control: no-store');
    if ($formato === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"caderno-visitas-$data.csv\"");
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // BOM: acentos certos no Excel
        $cab = ['Código', 'Prioridade', 'Status', 'Tipo', 'Bairro', 'Endereço', 'Aluguel', 'Condomínio', 'IPTU', 'Taxa de lixo (ano)',
            'Total mensal', 'Quartos', 'Suítes', 'Banheiros', 'Vagas', 'Área (m²)', 'Andar', 'Elevador', 'Mobiliado'];
        $cab = array_merge($cab, array_values(CV_CHECKLIST), ['Minutos até o terminal (HGT Aracruz)', 'Km até o terminal', 'Visita em', 'Nota',
            'Motivo do descarte', 'Corretor', 'Imobiliária', 'WhatsApp', 'Link do anúncio', 'Link do Maps',
            'Anotações', 'Fotos', 'Vídeos', 'Criado em', 'Atualizado em']);
        fputcsv($out, $cab, ';', '"', '');
        $num = fn($v) => $v === null ? '' : number_format((float)$v, 2, ',', '');
        foreach ($saida as $s) {
            $linha = [$s['codigo'], $s['prioridade'], $s['status'], $s['tipo'], $s['bairro'], $s['endereco'],
                $num($s['aluguel']), $num($s['condominio']), $num($s['iptu']), $num($s['taxa_lixo_ano']), $num($s['total_mensal']),
                $s['quartos'], $s['suites'], $s['banheiros'], $s['vagas'],
                $s['area_m2'] === null ? '' : $num($s['area_m2']), $s['andar'], $s['elevador'], $s['mobiliado']];
            $linha = array_merge($linha, array_values($s['checklist']), [$s['minutos_ate_terminal'],
                $s['km_ate_terminal'] === null ? '' : number_format((float)$s['km_ate_terminal'], 1, ',', ''), $s['visita_em'],
                $s['nota'], $s['motivo_descarte'], $s['corretor'], $s['imobiliaria'], $s['whatsapp'],
                $s['link_anuncio'], $s['link_maps'], $s['anotacoes'], implode(' | ', $s['fotos']), implode(' | ', $s['videos']),
                $s['criado_em'], $s['atualizado_em']]);
            // Evita que o Excel interprete células iniciadas por = + - @ como fórmula.
            $linha = array_map(fn($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'$v" : $v, $linha);
            fputcsv($out, $linha, ';', '"', '');
        }
        fclose($out);
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    header("Content-Disposition: attachment; filename=\"caderno-visitas-$data.json\"");
    echo json_encode([
        'exportado_em' => cv_agora(),
        'cidade' => 'Aracruz/ES',
        'total_imoveis' => count($saida),
        'imoveis' => $saida,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

// ───────── Roteamento ─────────

switch (true) {
    case $recurso === 'imoveis' && $id === null && $metodo === 'GET':
        cv_json(['imoveis' => listar()]);
    case $recurso === 'imoveis' && $id === null && $metodo === 'POST':
        cv_json(['imovel' => criar(validar(corpo()))], 201);
    case $recurso === 'imoveis' && $id !== null && $acao === null && $metodo === 'GET':
        cv_json(['imovel' => buscar($id)]);
    case $recurso === 'imoveis' && $id !== null && $acao === null && in_array($metodo, ['POST', 'PUT'], true):
        cv_json(['imovel' => atualizar($id, validar(corpo()))]);
    case $recurso === 'imoveis' && $id !== null && (($acao === 'excluir' && $metodo === 'POST') || ($acao === null && $metodo === 'DELETE')):
        excluir_imovel($id);
        cv_json(['ok' => true]);
    case $recurso === 'imoveis' && $id !== null && $acao === 'fotos' && $metodo === 'POST':
        cv_json(['foto' => receber_foto($id)], 201);
    case $recurso === 'imoveis' && $id !== null && $acao === 'video' && $metodo === 'POST':
        cv_json(receber_parte_video($id));
    case $recurso === 'imoveis' && $id !== null && $acao === 'capa' && $metodo === 'POST':
        $fotoId = (int)(corpo()['foto_id'] ?? 0);
        $st = db()->prepare('SELECT arquivo FROM fotos WHERE id = ? AND imovel_id = ?');
        $st->execute([$fotoId, $id]);
        $arq = $st->fetchColumn();
        if ($arq === false) {
            cv_erro('Foto não encontrada.', 404);
        }
        if (cv_tipo_arquivo((string)$arq) !== 'foto') {
            cv_erro('Vídeo não pode ser capa.');
        }
        db()->prepare('UPDATE imoveis SET capa_foto_id = ? WHERE id = ?')->execute([$fotoId, $id]);
        cv_json(['imovel' => buscar($id)]);
    case $recurso === 'fotos' && $id !== null && (($acao === 'excluir' && $metodo === 'POST') || ($acao === null && $metodo === 'DELETE')):
        excluir_foto($id);
        cv_json(['ok' => true]);
    case $recurso === 'ordem' && $metodo === 'POST':
        $ids = corpo()['ids'] ?? null;
        if (!is_array($ids)) {
            cv_erro('Lista de ordem inválida.');
        }
        salvar_ordem($ids);
        cv_json(['ok' => true]);
    case $recurso === 'distancia' && $metodo === 'POST':
        $c = corpo();
        try {
            $local = cv_localizar((string)($c['link'] ?? ''), (string)($c['endereco'] ?? ''));
            cv_json(cv_rota_terminal($local['lat'], $local['lng']) + $local);
        } catch (RuntimeException $e) {
            cv_erro($e->getMessage(), 422);
        }
    case $recurso === 'exportar' && $metodo === 'GET':
        exportar(($_GET['formato'] ?? 'json') === 'csv' ? 'csv' : 'json');
    default:
        cv_erro('Rota não encontrada.', 404);
}
