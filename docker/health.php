<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

$command = $argv[1] ?? null;
if ($command !== null) {
    $found = false;
    foreach (glob('/proc/[0-9]*/cmdline') ?: [] as $file) {
        $arguments = explode("\0", (string) @file_get_contents($file));
        if (in_array('artisan', $arguments, true) && in_array($command, $arguments, true)) {
            $found = true;
            break;
        }
    }
    if (! $found) {
        exit(1);
    }
}

try {
    require __DIR__.'/../vendor/autoload.php';
    $app = require __DIR__.'/../bootstrap/app.php';
    $app->make(Kernel::class)->bootstrap();
    DB::select('SELECT 1');
    Cache::store('redis')->get('container-health');
} catch (Throwable) {
    // The container status carries the failure without logging connection details.
    exit(1);
}
