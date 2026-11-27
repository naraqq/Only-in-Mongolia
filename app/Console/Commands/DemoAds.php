<?php

namespace App\Console\Commands;

use App\Media\Ffmpeg;
use App\Models\Ad;
use App\Models\Company;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * DEV ONLY: php artisan demo:ads — made-up companies with sponsored campaigns in every state (running, one of them a
 * video; scheduled; paid and waiting for review; rejected and refunded; not paid yet), with two weeks of views and
 * clicks, so the banner column, Business area and admin review have something to show. --fresh replaces them.
 * The companies and their brands are fictional. Refuses to run in production.
 */
class DemoAds extends Command
{
    protected $signature = 'demo:ads {--fresh : Remove the earlier demo companies and campaigns first}';

    protected $description = 'Add demo companies and sponsored campaigns (development only)';

    private const MANIFEST = 'demo/ads.json';

    /** name, register number, colour, campaign: [title, body, picture or "video", state, starts in days, runs days] */
    private const COMPANIES = [
        ['Талын Салхи Аялал', '6123401', [14, 116, 144], ['Говьд 5 хоногийн аялал', 'Хонгорын элс, Ёлын ам. Зуны хямдрал 20%.', 'video:ger-camp.jpg', 'running', -6, 21]],
        ['Нүүдэл Кофе', '6123402', [120, 72, 40], ['Шинэ амтлаг латте ☕', 'Салбар бүрт 2 дахь аяга үнэгүй.', 'eagle-hunter.jpg', 'running', -3, 14]],
        ['Алтай Морин Клуб', '6123403', [180, 83, 9], ['Наадмын өмнөх морь унах сургалт', 'Хүүхэд, том хүнд. Бүртгэл эхэллээ.', 'horses-naadam.jpg', 'scheduled', 3, 10]],
        ['Бүргэд Фото Студи', '6123404', [30, 64, 175], ['Бүргэдчидтэй хамт гэрэл зургийн аялал', 'Баян-Өлгий, 7 хоног. Хязгаартай суудал.', 'eagle-hunter.jpg', 'pending', 2, 7]],
        ['Хурд Онлайн Казино', '6123405', [190, 18, 60], ['Хурдан хожоорой!!!', 'Бүртгүүлээд 100,000₮ бонус.', 'eagle-men.jpg', 'rejected', 1, 7]],
        ['Сүмбэр Ном', '6123406', [21, 128, 61], ['Зуны ном унших сорил', 'Сар бүр 3 ном, 30% хямдралтай.', 'ger-camp.jpg', 'unpaid', 5, 14]],
    ];

    /** @var list<string> files written on the public disk */
    private array $files = [];

    public function handle(Ffmpeg $ffmpeg): int
    {
        if (app()->isProduction()) {
            $this->error('demo:ads is for development only.');

            return self::FAILURE;
        }
        $local = Storage::disk('local');
        if ($local->exists(self::MANIFEST)) {
            if (! $this->option('fresh')) {
                $this->error('Demo campaigns already exist. Run again with --fresh to replace them.');

                return self::FAILURE;
            }
            $this->clear(json_decode($local->get(self::MANIFEST), true));
        }
        mt_srand(20261127);
        $admin = User::where('is_admin', true)->orderBy('id')->first();
        $users = [];
        $ads = [];

        foreach (self::COMPANIES as $i => [$name, $register, $rgb, $campaign]) {
            $user = User::create([
                'name' => $name,
                'email' => 'demo-company-'.($i + 1).'@demo.local',
                'birthdate' => '1990-01-01',
            ]);
            $users[] = $user->id;
            $company = Company::create([
                'user_id' => $user->id,
                'name' => $name,
                'register_number' => $register,
                'email' => 'info+'.($i + 1).'@example.com',
                'website' => 'https://example.com/'.Str::slug(Str::ascii($name)),
                'logo_path' => $this->logo($name, $rgb),
            ]);
            $ads[] = $this->campaign($company, $user, $campaign, $rgb, $ffmpeg, $admin)->id;
        }

        $local->put(self::MANIFEST, json_encode(['users' => $users, 'ads' => $ads, 'files' => $this->files]));
        $this->info('Added '.count($users).' demo companies and '.count($ads).' campaigns (2 running, 1 scheduled, 1 to review, 1 rejected, 1 unpaid).');

        return self::SUCCESS;
    }

    private function campaign(Company $company, User $user, array $c, array $rgb, Ffmpeg $ffmpeg, ?User $admin): Ad
    {
        [$title, $body, $media, $state, $startIn, $days] = $c;
        $start = Carbon::today()->addDays($startIn);
        $price = Ad::priceFor($days);
        $files = str_starts_with($media, 'video:') ? $this->video(substr($media, 6), $ffmpeg) : ['image_path' => $this->picture($media)];
        $reviewed = in_array($state, ['running', 'scheduled', 'rejected'], true);

        $ad = $company->ads()->create([
            ...$files,
            'advertiser' => $company->name,
            'title' => $title,
            'body' => $body,
            'url' => $company->website,
            'starts_on' => $start,
            'ends_on' => $start->copy()->addDays($days - 1),
            'active' => true,
            'weight' => 1,
            'allow_adult' => false,
            'price' => $price,
            'created_by' => $user->id,
            'review_status' => match ($state) {
                'unpaid' => Ad::UNPAID,
                'pending' => Ad::PENDING,
                'rejected' => Ad::REJECTED,
                default => Ad::APPROVED,
            },
            'reject_reason' => $state === 'rejected' ? 'Мөрийтэй тоглоомын сурталчилгааг байршуулдаггүй.' : null,
            'submitted_at' => $state === 'unpaid' ? null : $start->copy()->subDays(2),
            'reviewed_at' => $reviewed ? $start->copy()->subDay() : null,
            'reviewed_by' => $reviewed ? $admin?->id : null,
        ]);

        if ($state !== 'unpaid') {
            Payment::create([
                'user_id' => $user->id, 'creator_profile_id' => null, 'purpose' => Payment::AD, 'ad_id' => $ad->id,
                'amount' => $price, 'platform_fee' => $price, 'provider' => 'fake',
                'status' => $state === 'rejected' ? Payment::REFUNDED : Payment::PAID,
                'paid_at' => $start->copy()->subDays(2),
                ...($state === 'rejected' ? ['refunded_at' => $start->copy()->subDay(), 'refunded_by' => $admin?->id, 'refund_reason' => $ad->reject_reason] : []),
            ]);
        }

        // Views and clicks for the days it has run (a little over 1% click rate, more on weekends).
        if ($state === 'running') {
            $rows = [];
            for ($d = $start->copy(); $d->lte(Carbon::today()); $d->addDay()) {
                $views = mt_rand(180, 520) * ($d->isWeekend() ? 2 : 1);
                $rows[] = ['ad_id' => $ad->id, 'day' => $d->toDateString(), 'impressions' => $views, 'clicks' => (int) round($views * mt_rand(6, 22) / 1000)];
            }
            DB::table('ad_stats')->insert($rows);
        }

        return $ad;
    }

    /** One of the app's own photos, cropped to the banner's 6:5 at 1200×1000. */
    private function picture(string $file): string
    {
        $src = imagecreatefromjpeg(public_path("images/auth/{$file}"));
        [$w, $h] = [imagesx($src), imagesy($src)];
        $cw = min($w, (int) round($h * 1.2));
        $ch = (int) round($cw / 1.2);
        $out = imagecreatetruecolor(1200, 1000);
        imagecopyresampled($out, $src, 0, 0, (int) (($w - $cw) / 2), (int) (($h - $ch) / 2), 1200, 1000, $cw, $ch);

        return $this->putJpeg('ads/demo-'.Str::lower((string) Str::ulid()).'.jpg', $out);
    }

    /** A square logo: the company's initials on its colour. */
    private function logo(string $name, array $rgb): string
    {
        $img = imagecreatetruecolor(400, 400);
        imagefill($img, 0, 0, imagecolorallocate($img, ...$rgb));
        $white = imagecolorallocate($img, 255, 255, 255);
        // Built-in fonts are Latin only, so a simple mark instead of Cyrillic letters: rings and a dot.
        imagesetthickness($img, 18);
        imageellipse($img, 200, 200, 250, 250, $white);
        imagefilledellipse($img, 200, 200, 70 + (crc32($name) % 50), 70 + (crc32($name) % 50), $white);

        return $this->putJpeg('companies/demo-'.Str::lower((string) Str::ulid()).'.jpg', $img);
    }

    /**
     * An 8-second video banner (a slow zoom over one of the app's photos, with a soft tone), made with ffmpeg, plus
     * its still. Without ffmpeg the campaign gets the picture instead.
     *
     * @return array{video_path?: string, poster_path?: string, image_path?: string}
     */
    private function video(string $photo, Ffmpeg $ffmpeg): array
    {
        if (! $ffmpeg->available()) {
            $this->warn('ffmpeg not found: the video campaign gets a picture instead.');

            return ['image_path' => $this->picture($photo)];
        }
        $id = Str::lower((string) Str::ulid());
        $disk = Storage::disk('public');
        $disk->makeDirectory('ads/videos');
        $video = "ads/videos/demo-{$id}.web.mp4";
        $poster = "ads/videos/demo-{$id}.web.poster.jpg";
        $run = Process::timeout(180)->run([
            config('media.ffmpeg'), '-hide_banner', '-nostdin', '-y',
            '-loop', '1', '-framerate', '30', '-t', '8', '-i', public_path("images/auth/{$photo}"),
            '-f', 'lavfi', '-i', 'sine=frequency=262:duration=8,volume=0.15',
            '-vf', "scale=2400:2000:force_original_aspect_ratio=increase,crop=2400:2000,zoompan=z='min(zoom+0.0012,1.3)':d=240:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1200x1000:fps=30,format=yuv420p",
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '96k', '-shortest',
            '-movflags', '+faststart', $disk->path($video),
        ]);
        if (! $run->successful()) {
            $this->warn('Could not make the demo video ('.trim(substr($run->errorOutput(), -200)).'); using a picture.');

            return ['image_path' => $this->picture($photo)];
        }
        $ffmpeg->frame($disk->path($video), $disk->path($poster), 2.0, 1200);
        $this->files[] = $video;
        $this->files[] = $poster;

        return ['video_path' => $video, 'poster_path' => $poster];
    }

    private function putJpeg(string $path, \GdImage $img): string
    {
        $disk = Storage::disk('public');
        File::ensureDirectoryExists(dirname($disk->path($path)));
        imagejpeg($img, $disk->path($path), 85);
        imagedestroy($img);
        $this->files[] = $path;

        return $path;
    }

    private function clear(array $manifest): void
    {
        $ads = $manifest['ads'] ?? [];
        Payment::whereIn('ad_id', $ads)->where('purpose', Payment::AD)->delete();
        Ad::whereIn('id', $ads)->delete(); // their numbers go with them
        User::whereIn('id', $manifest['users'] ?? [])->where('email', 'like', 'demo-company-%@demo.local')->delete();
        Storage::disk('public')->delete($manifest['files'] ?? []);
        Storage::disk('local')->delete(self::MANIFEST);
        $this->line('Removed the earlier demo companies and campaigns.');
    }
}
