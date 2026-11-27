<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
        ],

        // Cloudflare R2 (S3-compatible, no charge for downloads). Keep the bucket private: no public r2.dev
        // access or public domain; the app hands out short-lived signed links after its permission check.
        'r2' => [
            'driver' => 's3',
            'key' => env('R2_ACCESS_KEY_ID'),
            'secret' => env('R2_SECRET_ACCESS_KEY'),
            'region' => 'auto',
            'bucket' => env('R2_BUCKET'),
            // https://<account id>.r2.cloudflarestorage.com
            'endpoint' => env('R2_ENDPOINT'),
            'use_path_style_endpoint' => true,
            'visibility' => 'private',
            'throw' => true,
        ],

        // Backups (App\Console\Commands\MediaBackup, backup:store): a second private bucket, ideally in another account
        // or provider, holding a copy of every media file and the database backups. Same R2 keys unless set.
        'backup' => [
            'driver' => 's3',
            'key' => env('BACKUP_ACCESS_KEY_ID', env('R2_ACCESS_KEY_ID')),
            'secret' => env('BACKUP_SECRET_ACCESS_KEY', env('R2_SECRET_ACCESS_KEY')),
            'region' => env('BACKUP_REGION', 'auto'),
            'bucket' => env('BACKUP_BUCKET'),
            'endpoint' => env('BACKUP_ENDPOINT', env('R2_ENDPOINT')),
            'use_path_style_endpoint' => true,
            'visibility' => 'private',
            'throw' => true,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Media Disk
    |--------------------------------------------------------------------------
    |
    | Where creators' photos, videos and ID documents are kept (App\Media\Files): "local" (this server's
    | private disk) or "r2". Profile photos and covers stay on the "public" disk.
    |
    */

    'media_disk' => env('MEDIA_DISK', 'local'),

    // Serve existing local uploads when switching new uploads to a bucket without a bulk copy.
    'media_local_fallback' => env('MEDIA_LOCAL_FALLBACK', false),

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
