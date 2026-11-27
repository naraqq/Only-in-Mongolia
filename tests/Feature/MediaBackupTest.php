<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Every media file is copied to the backup bucket nightly; deleted ones stay there a while; it all comes back on restore. */
class MediaBackupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local'); // the media disk in tests
        Storage::fake('backup');
        config(['filesystems.disks.backup.bucket' => 'oim-backup']);
    }

    public function test_media_files_are_copied_once_and_again_only_when_changed(): void
    {
        $media = Storage::disk('local');
        $media->put('users/1/posts/2026/11/a.jpg', 'photo');
        $media->put('users/1/posts/2026/11/b.web.hls/v0/seg_0000.m4s', 'piece');
        $media->put('kyc/1/id-front.jpg', 'id');
        $media->put('media-cache/users/1/posts/2026/11/a.jpg', 'working copy');
        $media->put('demo/artist.json', '{}');

        $this->artisan('media:backup')->expectsOutputToContain('3 file(s) copied')->assertSuccessful();
        $backup = Storage::disk('backup');
        $backup->assertExists(['media/users/1/posts/2026/11/a.jpg', 'media/users/1/posts/2026/11/b.web.hls/v0/seg_0000.m4s', 'media/kyc/1/id-front.jpg']);
        $backup->assertMissing(['media/media-cache/users/1/posts/2026/11/a.jpg', 'media/demo/artist.json']);

        $this->artisan('media:backup')->expectsOutputToContain('0 file(s) copied')->assertSuccessful();
        $media->put('users/1/posts/2026/11/a.jpg', 'a new photo');
        $this->artisan('media:backup')->expectsOutputToContain('1 file(s) copied')->assertSuccessful();
        $this->assertSame('a new photo', $backup->get('media/users/1/posts/2026/11/a.jpg'));
    }

    public function test_a_deleted_file_stays_in_the_backup_for_30_days_and_can_be_restored(): void
    {
        $media = Storage::disk('local');
        $media->put('users/1/posts/2026/11/a.jpg', 'photo');
        $this->artisan('media:backup')->assertSuccessful();

        $media->delete('users/1/posts/2026/11/a.jpg');
        $this->artisan('media:backup')->expectsOutputToContain('1 kept from deleted files')->assertSuccessful();
        $this->artisan('media:backup --restore')->expectsOutputToContain('1 file(s) restored')->assertSuccessful();
        $this->assertSame('photo', $media->get('users/1/posts/2026/11/a.jpg'));

        $media->delete('users/1/posts/2026/11/a.jpg');
        $this->artisan('media:backup')->assertSuccessful();
        $this->travel(29)->days();
        $this->artisan('media:backup')->assertSuccessful();
        Storage::disk('backup')->assertExists('media/users/1/posts/2026/11/a.jpg');
        $this->travel(2)->days();
        $this->artisan('media:backup')->expectsOutputToContain('1 removed after 30 days')->assertSuccessful();
        Storage::disk('backup')->assertMissing('media/users/1/posts/2026/11/a.jpg');
    }

    public function test_database_backups_are_stored_off_the_server_and_old_ones_pruned(): void
    {
        $file = str_replace(DIRECTORY_SEPARATOR, '/', (string) tempnam(sys_get_temp_dir(), 'db'));
        file_put_contents($file, gzencode('-- dump'));
        Storage::disk('backup')->put('database/old.sql.gz', 'old');
        $this->travel(60)->days();

        $this->artisan("backup:store database/new.sql.gz --file={$file} --keep-days=56")->expectsOutputToContain('Stored database/new.sql.gz')->assertSuccessful();
        Storage::disk('backup')->assertExists('database/new.sql.gz');
        Storage::disk('backup')->assertMissing('database/old.sql.gz');
        $this->artisan("backup:store media/evil.jpg --file={$file}")->assertFailed(); // not into the media copy
    }

    public function test_nothing_happens_without_a_backup_bucket(): void
    {
        config(['filesystems.disks.backup.bucket' => null]);
        Storage::disk('local')->put('users/1/a.jpg', 'x');
        $this->artisan('media:backup')->expectsOutputToContain('No backup bucket')->assertSuccessful();
        Storage::disk('backup')->assertMissing('media/users/1/a.jpg');
    }
}
