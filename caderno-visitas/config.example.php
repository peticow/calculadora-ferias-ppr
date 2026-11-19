<?php
// Modelo de configuração. O config.php de verdade é criado pelo setup.php
// no servidor e NUNCA vai para o Git (está no .gitignore e bloqueado na web).
//
// Para gerar o hash à mão:  php -r 'echo password_hash("SUA_SENHA", PASSWORD_DEFAULT), PHP_EOL;'
if (!defined('CV_APP')) {
    http_response_code(403);
    exit;
}

return [
    'password_hash' => '$2y$10$troque.por.um.hash.gerado.com.password_hash',

    // Opção 1 — SQLite (padrão, não precisa criar nada no cPanel)
    'db' => [
        'driver' => 'sqlite',
        'path' => __DIR__ . '/data/caderno.sqlite',
    ],

    // Opção 2 — MySQL (use se o servidor não tiver pdo_sqlite)
    // 'db' => [
    //     'driver' => 'mysql',
    //     'host' => 'localhost',
    //     'name' => 'usuario_caderno',
    //     'user' => 'usuario_caderno',
    //     'pass' => 'senha-do-banco',
    // ],
];
