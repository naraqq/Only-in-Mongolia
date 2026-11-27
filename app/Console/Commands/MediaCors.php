<?php

namespace App\Console\Commands;

use Aws\S3\S3Client;
use Illuminate\Console\Command;
use Throwable;

/**
 * php artisan media:cors — let the site's pages read the media bucket from the browser. Adaptive streaming
 * (App\Media\Hls) loads its pieces with JavaScript (hls.js) straight from the bucket's signed links, which a
 * browser only allows when the bucket says the site may (CORS). Plain video and image links don't need it.
 * Allows GET/HEAD from APP_URL (and any --origin given), nothing else.
 */
class MediaCors extends Command
{
    protected $signature = 'media:cors {--disk=r2 : The bucket disk} {--origin=* : More sites to allow (e.g. http://localhost:8000)} {--show : Only show the current rules}';

    protected $description = 'Allow the site to stream video pieces from the media bucket (CORS)';

    public function handle(): int
    {
        $config = config('filesystems.disks.'.$this->option('disk'));
        if (($config['driver'] ?? null) !== 's3' || empty($config['bucket'])) {
            $this->error('That disk is not a bucket.');

            return self::FAILURE;
        }
        $client = new S3Client([
            'version' => 'latest',
            'region' => $config['region'] ?? 'auto',
            'endpoint' => $config['endpoint'] ?? null,
            'use_path_style_endpoint' => (bool) ($config['use_path_style_endpoint'] ?? false),
            'credentials' => ['key' => $config['key'], 'secret' => $config['secret']],
        ]);

        try {
            if ($this->option('show')) {
                $this->line(json_encode($client->getBucketCors(['Bucket' => $config['bucket']])->get('CORSRules'), JSON_PRETTY_PRINT));

                return self::SUCCESS;
            }
            $origins = collect([config('app.url'), ...$this->option('origin')])
                ->map(fn ($o) => rtrim((string) $o, '/'))->filter()->unique()->values()->all();
            $client->putBucketCors([
                'Bucket' => $config['bucket'],
                'CORSConfiguration' => ['CORSRules' => [[
                    'AllowedOrigins' => $origins,
                    'AllowedMethods' => ['GET', 'HEAD'],
                    'AllowedHeaders' => ['Range', 'Content-Type'],
                    'ExposeHeaders' => ['Content-Length', 'Content-Range', 'ETag'],
                    'MaxAgeSeconds' => 86400,
                ]]],
            ]);
            $this->info('The bucket now lets these sites stream from it: '.implode(', ', $origins));
        } catch (Throwable $e) {
            $this->error('Could not change the bucket’s CORS rules: '.$e->getMessage());
            $this->line('If the R2 key may only read and write files, add the rule in the Cloudflare dashboard instead:');
            $this->line('R2 → the bucket → Settings → CORS policy: allow GET and HEAD from your site’s address.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
