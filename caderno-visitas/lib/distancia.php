<?php
// Tempo e distância de carro do imóvel até o terminal HGT Aracruz.
// 1) coordenadas do link do Maps (segue links curtos do Google);
// 2) se o Google não entregar coordenadas, geocodifica o endereço (OpenStreetMap);
// 3) rota de carro pelo OSRM.
declare(strict_types=1);

if (!defined('CV_APP')) {
    http_response_code(403);
    exit;
}

const CV_UA = 'CadernoVisitas/1.0 (uso pessoal)';

// O roteador gratuito (OSRM) usa velocidades mais baixas que as do trânsito real.
// Calibrado contra o Google Maps em Aracruz → terminal: 30,4 min (OSRM) = 25 min (Google)
// e 31,0 min = 26 min. Fator médio 0,83.
const CV_FATOR_TEMPO = 0.83;

/** Só seguimos links do Google: impede o servidor de acessar endereços arbitrários. */
function cv_host_google(string $url): bool
{
    $h = strtolower((string)parse_url($url, PHP_URL_HOST));
    return (bool)preg_match('/(^|\.)(goo\.gl|g\.co|google\.com|google\.com\.br)$/', $h);
}

/** GET simples. Retorna [status, corpo, cabeçalho Location]. */
function cv_http(string $url, int $timeout = 12): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $loc = null;
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_USERAGENT => CV_UA,
            CURLOPT_HTTPHEADER => ['Accept-Language: pt-BR'],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            CURLOPT_HEADERFUNCTION => function ($c, $linha) use (&$loc) {
                if (stripos($linha, 'location:') === 0) {
                    $loc = trim(substr($linha, 9));
                }
                return strlen($linha);
            },
        ]);
        $corpo = curl_exec($ch);
        $st = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$st, $corpo === false ? '' : (string)$corpo, $loc];
    }
    $ctx = stream_context_create(['http' => [
        'timeout' => $timeout, 'follow_location' => 0, 'ignore_errors' => true,
        'header' => "User-Agent: " . CV_UA . "\r\nAccept-Language: pt-BR\r\n",
    ]]);
    $corpo = @file_get_contents($url, false, $ctx);
    $st = 0;
    $loc = null;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('~^HTTP/\S+\s+(\d+)~', $h, $m)) {
            $st = (int)$m[1];
        } elseif (stripos($h, 'location:') === 0) {
            $loc = trim(substr($h, 9));
        }
    }
    return [$st, $corpo === false ? '' : $corpo, $loc];
}

function cv_coord_valida(float $lat, float $lng): bool
{
    return $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180 && !($lat == 0.0 && $lng == 0.0);
}

/** Extrai coordenadas do texto de um link do Maps. */
function cv_coords_do_link(string $url): ?array
{
    $u = urldecode($url);
    $num = '(-?\d{1,3}\.\d+)';
    $padroes = [
        "~!3d$num!4d$num~",                                            // ponto exato do lugar
        "~[?&](?:q|query|ll|sll|center|destination|daddr)=(?:loc:)?$num\s*,\s*\+?$num~",
        "~/maps/(?:search|dir|place)/(?:[^/]*/)?$num\s*,\s*\+?$num~",
        "~@$num,$num~",                                                // centro do mapa
    ];
    foreach ($padroes as $p) {
        if (preg_match($p, $u, $m) && cv_coord_valida((float)$m[1], (float)$m[2])) {
            return ['lat' => (float)$m[1], 'lng' => (float)$m[2]];
        }
    }
    // "Local sem nome" (alfinete solto no mapa): 19°49'13.6"S 40°17'09.8"W
    $t = str_replace(['+', '″', '′', 'º'], [' ', '"', "'", '°'], $u);
    $g = '(\d{1,3})°\s*(\d{1,2})\'\s*([\d.]+)"?\s*';
    if (preg_match("~{$g}([NS])[\s,]*{$g}([EWLO])~u", $t, $m)) {
        $lat = ((int)$m[1] + (int)$m[2] / 60 + (float)$m[3] / 3600) * ($m[4] === 'S' ? -1 : 1);
        $lng = ((int)$m[5] + (int)$m[6] / 60 + (float)$m[7] / 3600) * (in_array($m[8], ['W', 'O'], true) ? -1 : 1);
        if (cv_coord_valida($lat, $lng)) {
            return ['lat' => round($lat, 6), 'lng' => round($lng, 6)];
        }
    }
    return null;
}

/** Texto de endereço contido no link (/maps/place/NOME ou ?q=TEXTO). */
function cv_endereco_do_link(string $url): ?string
{
    $u = urldecode(str_replace('+', ' ', $url));
    if (preg_match('~/maps/place/([^/@?]+)~', $u, $m)) {
        return trim($m[1]);
    }
    if (preg_match('~[?&](?:q|query|daddr)=([^&]+)~', $u, $m) && !preg_match('/^-?\d+\.\d+,/', $m[1])) {
        return trim($m[1]);
    }
    return null;
}

function cv_geocodificar(string $texto): ?array
{
    $texto = trim($texto);
    if (mb_strlen($texto) < 4) {
        return null;
    }
    if (!preg_match('/aracruz/i', $texto)) {
        $texto .= ', Aracruz, ES';
    }
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query([
        'format' => 'jsonv2', 'limit' => 1, 'countrycodes' => 'br', 'q' => $texto,
    ]);
    [$st, $corpo] = cv_http($url);
    $r = $st === 200 ? json_decode($corpo, true) : null;
    if (!is_array($r) || empty($r[0]['lat'])) {
        return null;
    }
    return ['lat' => (float)$r[0]['lat'], 'lng' => (float)$r[0]['lon']];
}

/**
 * Descobre onde fica o imóvel. Retorna [lat, lng, origem] ou erro (RuntimeException).
 * origem: 'link' (exato) ou 'endereco' (aproximado).
 */
function cv_localizar(string $link, string $endereco): array
{
    $link = trim($link);
    $textoEndereco = null;
    if ($link !== '') {
        if (!preg_match('~^https?://~i', $link)) {
            throw new RuntimeException('O link do Maps precisa começar com https://');
        }
        $atual = $link;
        for ($i = 0; $i < 5; $i++) {
            if ($c = cv_coords_do_link($atual)) {
                return $c + ['origem' => 'link'];
            }
            $textoEndereco = cv_endereco_do_link($atual) ?? $textoEndereco;
            if (!cv_host_google($atual)) {
                break;
            }
            [$st, , $loc] = cv_http($atual);
            if ($st < 300 || $st >= 400 || !$loc) {
                break;
            }
            if (!preg_match('~^https?://~i', $loc)) {
                $p = parse_url($atual);
                $loc = $p['scheme'] . '://' . $p['host'] . '/' . ltrim($loc, '/');
            }
            $atual = $loc;
        }
    }
    foreach ([$textoEndereco, $endereco] as $t) {
        if ($t && ($c = cv_geocodificar($t))) {
            return $c + ['origem' => 'endereco'];
        }
    }
    throw new RuntimeException($link !== ''
        ? 'Não consegui achar o ponto desse link. Use "Usar minha localização" no imóvel ou preencha o endereço.'
        : 'Cole o link do Maps ou preencha o endereço.');
}

/** Rota de carro até o terminal. */
function cv_rota_terminal(float $lat, float $lng): array
{
    $t = CV_TERMINAL;
    $url = sprintf('https://router.project-osrm.org/route/v1/driving/%.6F,%.6F;%.6F,%.6F?overview=false',
        $lng, $lat, $t['lng'], $t['lat']);
    [$st, $corpo] = cv_http($url, 15);
    $r = json_decode($corpo, true);
    if ($st !== 200 || ($r['code'] ?? '') !== 'Ok' || empty($r['routes'][0])) {
        throw new RuntimeException('O serviço de rotas não respondeu. Tente de novo em instantes.');
    }
    $rota = $r['routes'][0];
    return [
        'minutos' => max(1, (int)round($rota['duration'] * CV_FATOR_TEMPO / 60)),
        'km' => round($rota['distance'] / 1000, 1),
    ];
}
