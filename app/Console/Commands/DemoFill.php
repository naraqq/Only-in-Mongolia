<?php

namespace App\Console\Commands;

use App\Media\Files;
use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\QaQuestion;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * DEV ONLY: php artisan demo:fill narmandakh — fills a creator's page with believable activity over the last
 * 30 days (fans, follows, subscriptions, tips, paid posts, likes, comments, views, a poll, live Q&As, page
 * visits with where they came from), so the studio, insights and feeds have something to show.
 * Demo fans are demo-fan-N@demo.local; --fresh removes them and the demo posts first. Refuses to run in production.
 */
class DemoFill extends Command
{
    protected $signature = 'demo:fill {handle : The creator to fill} {--fans=40 : How many demo fans} {--fresh : Remove earlier demo data for this creator first}';

    protected $description = 'Fill a creator page with demo fans, posts and activity (development only)';

    private const NAMES = [
        'Анужин', 'Тэмүүлэн', 'Номин', 'Батбаяр', 'Сарнай', 'Ганзориг', 'Оюунчимэг', 'Билгүүн', 'Энхжин', 'Мөнхбат',
        'Хулан', 'Төгөлдөр', 'Солонго', 'Эрдэнэ', 'Нандин', 'Баярсайхан', 'Ариунаа', 'Дөлгөөн', 'Цэцэг', 'Отгонбаяр',
        'Уянга', 'Бат-Эрдэнэ', 'Мишээл', 'Чинзориг', 'Гэрэлмаа', 'Тулга', 'Saruul', 'Ochir', 'Zaya', 'Temka',
        'Нарандаа', 'Жаргал', 'Энхтуяа', 'Ганбаатар', 'Цолмон', 'Хангай', 'Мөнхзул', 'Алтанцэцэг', 'Бямба', 'Одгэрэл',
    ];

    private const COMMENTS = [
        'Ямар гоё зураг вэ 😍', 'Үнэхээр гайхалтай!', 'Дараагийнхыг хүлээж байна', 'Энэ хаана авсан зураг вэ?', 'Маш их таалагдлаа 🔥',
        'Баярлалаа, хуваалцсанд', 'Wow 👏', 'Сүпер!', 'Дахиад ийм зүйл оруулаарай', 'Миний хамгийн дуртай нийтлэл',
        'Монгол орон шиг сайхан газар байхгүй 🇲🇳', 'Энэ үнэхээр урам өгч байна', 'Хаха үнэн шүү', '❤️❤️❤️', 'Дараагийн аялал хаашаа вэ?',
    ];

    private const QUESTIONS = [
        'Хамгийн дуртай аялал чинь аль нь вэ?', 'Ямар камер ашигладаг вэ?', 'Зургаа хэрхэн засварладаг вэ?', 'Анх яаж эхэлсэн бэ?',
        'Дараагийн цуврал юуны тухай байх вэ?', 'Шинэхэн хүнд ямар зөвлөгөө өгөх вэ?', 'Хаана амьдардаг вэ?', 'Наадамд очих уу?',
        'Ямар хөгжим сонсдог вэ?', 'Өдөр бүр хэдэн цаг ажилладаг вэ?', 'Хамтарч ажиллах боломжтой юу?', 'Хамгийн хэцүү зураг аль нь байсан бэ?',
    ];

    private const TIP_NOTES = ['Баярлалаа!', 'Үргэлжлүүлээрэй 💪', 'Гоё контент', null, null, 'Кофе уугаарай ☕', 'Шилдэг нь!'];

    private CreatorProfile $creator;

    private Carbon $now;

    private int $fee;

    /** @var array<string, int> image file → stored path */
    private array $images = [];

    public function handle(): int
    {
        if (app()->isProduction()) {
            $this->error('demo:fill is for development only.');

            return self::FAILURE;
        }
        $creator = CreatorProfile::where('handle', mb_strtolower((string) $this->argument('handle')))->first();
        if (! $creator || ! $creator->isApproved()) {
            $this->error('No approved creator with that handle.');

            return self::FAILURE;
        }
        $this->creator = $creator;
        $this->now = now();
        $this->fee = (int) config('creators.platform_fee_percent');
        mt_srand(crc32($creator->handle)); // same handle, same story

        $manifest = "demo/{$creator->handle}.json";
        if (Storage::disk('local')->exists($manifest)) {
            if (! $this->option('fresh')) {
                $this->error('This creator already has demo data. Run again with --fresh to replace it.');

                return self::FAILURE;
            }
            $this->clear(json_decode(Storage::disk('local')->get($manifest), true));
        }

        $fans = $this->fans((int) $this->option('fans'));
        $posts = DB::transaction(fn () => $this->posts());
        DB::transaction(function () use ($fans, $posts) {
            $followers = $this->follows($fans, $posts);
            $subscribers = $this->subscriptions($followers, $posts);
            $this->tipsAndPurchases($followers, $subscribers, $posts);
            $this->engagement($followers, $subscribers, $posts);
            $this->qas($followers, $subscribers, $posts);
            $this->visits($followers, $posts);
            $this->notifications();
        });

        Storage::disk('local')->put($manifest, json_encode([
            'fans' => $fans->pluck('id')->all(),
            'posts' => collect($posts)->pluck('id')->all(),
            'series' => $this->creator->series()->where('title', 'Наадмын өдрүүд')->pluck('id')->all(),
            'files' => array_values($this->images),
        ]));

        $this->info("Filled @{$creator->handle}: {$fans->count()} fans, ".count($posts).' posts, '
            .DB::table('follows')->where('creator_profile_id', $creator->id)->count().' followers, '
            .$creator->subscriptions()->active()->count().' active subscribers.');

        return self::SUCCESS;
    }

    private function clear(array $manifest): void
    {
        User::whereIn('id', $manifest['fans'] ?? [])->where('email', 'like', 'demo-fan-%@demo.local')->delete();
        Post::whereIn('id', $manifest['posts'] ?? [])->where('creator_profile_id', $this->creator->id)->delete();
        $this->creator->series()->whereIn('id', $manifest['series'] ?? [])->delete();
        DB::table('vault_items')->where('creator_profile_id', $this->creator->id)->whereIn('path', $manifest['files'] ?? [])->delete();
        Files::delete($manifest['files'] ?? []);
        DB::table('page_visits')->where('creator_profile_id', $this->creator->id)->where('viewer', 'like', 's:demo%')->delete();
        if (($manifest['posts'] ?? []) && in_array($this->creator->pinned_post_id, $manifest['posts'], true)) {
            $this->creator->forceFill(['pinned_post_id' => null])->save();
        }
        $this->line('Removed the earlier demo data.');
    }

    private function fans(int $count)
    {
        $existing = User::where('email', 'like', 'demo-fan-%@demo.local')->pluck('email');

        return collect(range(1, $count))->map(function ($i) use ($existing) {
            $email = "demo-fan-{$i}-{$this->creator->id}@demo.local";
            if ($existing->contains($email)) {
                return User::where('email', $email)->first();
            }

            return User::forceCreate([
                'name' => self::NAMES[($i - 1) % count(self::NAMES)],
                'email' => $email,
                'password' => bcrypt(Str::random(32)),
                'birthdate' => Carbon::create(1985 + mt_rand(0, 18), mt_rand(1, 12), mt_rand(1, 28)),
                'created_at' => $this->now->copy()->subDays(mt_rand(31, 120)),
            ]);
        });
    }

    /** Copy a picture from public/images into the creator's private media, once. */
    private function image(string $file): array
    {
        if (! isset($this->images[$file])) {
            $path = "posts/{$this->creator->id}/demo-".pathinfo($file, PATHINFO_FILENAME).'.'.pathinfo($file, PATHINFO_EXTENSION);
            Files::put($path, file_get_contents(public_path("images/{$file}")));
            $this->images[$file] = $path;
            DB::table('vault_items')->insertOrIgnore([
                'creator_profile_id' => $this->creator->id, 'type' => 'image', 'path' => $path,
                'mime' => str_ends_with($file, '.png') ? 'image/png' : 'image/jpeg', 'sha256' => hash_file('sha256', public_path("images/{$file}")),
                'created_at' => $this->now, 'updated_at' => $this->now,
            ]);
        }

        return ['type' => 'image', 'path' => $this->images[$file], 'mime' => str_ends_with($file, '.png') ? 'image/png' : 'image/jpeg', 'scan_status' => 'clean'];
    }

    /** @return array<string, Post> */
    private function posts(): array
    {
        $at = fn (float $daysAgo) => $this->now->copy()->subMinutes((int) round($daysAgo * 1440));
        $make = function (string $key, float $daysAgo, array $fields, array $images = []) use ($at) {
            $post = $this->creator->posts()->create(['visibility' => Post::PUBLIC, 'is_adult' => false, ...$fields]);
            $post->forceFill(['created_at' => $at($daysAgo), 'updated_at' => $at($daysAgo), 'announced_at' => $at($daysAgo)])->saveQuietly();
            foreach ($images as $i => $file) {
                $post->media()->create([...$this->image($file), 'position' => $i]);
            }

            return [$key => $post];
        };
        $qaStart = fn ($start, int $minutes) => ['qa_starts_at' => $start, 'qa_ends_at' => $start->copy()->addMinutes($minutes)];
        $upcoming = $this->now->copy()->addDays(2)->setTime(20, 0);
        $live = $this->now->copy()->subMinutes(10);
        $ended = $this->now->copy()->subDays(5)->setTime(20, 0);

        $posts = array_merge(
            $make('hello', 28, ['body' => "Сайн байна уу! 👋 Энэ миний шинэ хуудас. Монголын байгаль, аялал, наадмын ард талын зургуудыг энд хуваалцана.\nSubscribe хийвэл бүх зураг, бичлэгийг үзэх боломжтой."], ['auth/ger-camp.jpg']),
            $make('naadam', 22, ['body' => 'Наадмын өглөө 🐎 Хурдан морьдын бэлтгэл хамгийн гоё мөч нь.'], ['auth/horses-naadam.jpg']),
            $make('eagle', 20, ['body' => 'Бүргэдчин ахтай нэг өдөр. Бүтэн цувралыг subscriber-уудад зориулж оруулна 🦅', 'visibility' => Post::SUBSCRIBERS], ['auth/eagle-hunter.jpg']),
            $make('camp', 15, ['body' => 'Хөвсгөлийн эрэг дээрх гэр бааз. Шөнө нь од ямар гоё харагддаг гээч ✨'], ['login-images/login-v2.png']),
            $make('behind', 12, ['body' => 'Зураг авалтын ард тал: өглөө 5 цагт босоод гэрэл хүлээх нь 😅', 'visibility' => Post::SUBSCRIBERS], ['auth/eagle-men.jpg', 'login-images/login-v3.png']),
            $make('poll', 10, ['body' => 'Дараагийн цуврал юуны тухай байвал таалагдах вэ?', 'poll_options' => ['Говийн аялал', 'Бүргэдийн баяр', 'Хотын амьдрал', 'Зураг засварын заавар']]),
            $make('ppv1', 9, ['body' => 'Бүргэдийн баярын онцгой цуврал: 12 зураг, засваргүй хувилбар.', 'price' => 5000], ['auth/eagle-men.jpg']),
            $make('notes', 6, ['body' => "Энэ сарын төлөвлөгөө:\n• Говь руу 5 хоногийн аялал\n• Шинэ цуврал\n• Subscriber-уудтай шууд асуулт хариулт", 'visibility' => Post::SUBSCRIBERS]),
            $make('qa_ended', 6, ['body' => 'Аялал, зураг авалтын талаар юу ч асуугаарай! 📸', ...$qaStart($ended, 60)]),
            $make('ppv2', 3, ['body' => 'Говийн нар жаргалт: өндөр нягтралтай 2 зураг 🌅', 'price' => 8000], ['login-images/login-v1.png', 'login-images/login-v2.png']),
            $make('sunday', 2, ['body' => 'Ням гарагийн амралт ☕ Та нар энэ долоо хоногт юу хийв?'], ['login-images/login-v1.png']),
            $make('qa_live', 1, ['body' => 'Шууд асуулт хариулт эхэллээ! Наадам, морин уралдааны тухай асуугаарай 🐎', ...$qaStart($live, 60)]),
            $make('qa_next', 0.5, ['body' => 'Энэ баасан гаригт шууд асуулт хариулт хийнэ. Сануулга асаагаад, асуултаа урьдчилж илгээгээрэй!', ...$qaStart($upcoming, 45)]),
            $make('scheduled', 0, ['body' => 'Маргааш гарах шинэ цуврал 🎞️', 'visibility' => Post::SUBSCRIBERS, 'publish_at' => $this->now->copy()->addDay()->setTime(19, 0)], ['auth/horses-naadam.jpg']),
        );
        $posts['scheduled']->forceFill(['announced_at' => null])->saveQuietly();
        $posts['qa_live']->forceFill(['qa_announced_at' => $live])->saveQuietly();
        $posts['qa_ended']->forceFill(['qa_announced_at' => $ended])->saveQuietly();

        $this->creator->forceFill(['pinned_post_id' => $posts['hello']->id])->save();
        $series = $this->creator->series()->create(['title' => 'Наадмын өдрүүд', 'description' => 'Наадмын бэлтгэлээс барианд хүртэл.', 'featured' => true]);
        $series->posts()->attach([$posts['naadam']->id => ['position' => 1], $posts['eagle']->id => ['position' => 2], $posts['behind']->id => ['position' => 3]]);

        return $posts;
    }

    private function pick(array $weights): string
    {
        $roll = mt_rand(1, array_sum($weights));
        foreach ($weights as $value => $weight) {
            if (($roll -= $weight) <= 0) {
                return $value;
            }
        }

        return array_key_first($weights);
    }

    private function between(Carbon $from, Carbon $to): Carbon
    {
        return $from->copy()->addSeconds(mt_rand(0, max(0, $to->getTimestamp() - $from->getTimestamp())));
    }

    /** About 80% of fans follow, each with where it came from. @return array<int, array{user: User, at: Carbon, referrer: string}> */
    private function follows($fans, array $posts): array
    {
        $free = collect($posts)->filter(fn (Post $p) => $p->visibility === Post::PUBLIC && ! $p->price && ! $p->publish_at);
        $followers = [];
        foreach ($fans as $fan) {
            if (mt_rand(1, 100) > 80) {
                continue;
            }
            $at = $this->between($this->now->copy()->subDays(29), $this->now->copy()->subHours(2));
            $seen = $free->filter(fn (Post $p) => $p->created_at < $at && $p->created_at > $at->copy()->subDays(7));
            $source = $this->pick(['profile' => 55, 'discover' => 18, 'home' => 12, 'search' => 10, 'feed' => 5]);
            $referrer = $this->pick(['instagram.com' => 30, 'facebook.com' => 14, 'ref:story' => 10, 'app:discover' => 20, 'app:search' => 9, 'direct' => 17]);
            DB::table('follows')->insertOrIgnore([
                'user_id' => $fan->id, 'creator_profile_id' => $this->creator->id, 'created_at' => $at, 'updated_at' => $at,
                'source' => $source, 'source_id' => null, 'referrer' => $referrer,
                'source_post_id' => $seen->isNotEmpty() && mt_rand(1, 100) <= 75 ? $seen->random()->id : null,
            ]);
            $followers[] = ['user' => $fan, 'at' => $at, 'referrer' => $referrer];
        }

        return $followers;
    }

    private function pay(User $fan, string $purpose, int $amount, Carbon $at, array $extra = []): Payment
    {
        return Payment::forceCreate([
            'user_id' => $fan->id, 'creator_profile_id' => $this->creator->id, 'purpose' => $purpose, 'amount' => $amount,
            'platform_fee' => intdiv($amount * $this->fee, 100), 'status' => Payment::PAID, 'provider' => 'fake', 'paid_at' => $at,
            'created_at' => $at, 'updated_at' => $at, ...$extra,
        ]);
    }

    /** About 40% of followers subscribe some time after following. @return array<int, User> */
    private function subscriptions(array $followers, array $posts): array
    {
        $price = (int) $this->creator->price_monthly;
        $series = $this->creator->series()->where('title', 'Наадмын өдрүүд')->value('id');
        $subscribers = [];
        foreach ($followers as $f) {
            if (mt_rand(1, 100) > 42) {
                continue;
            }
            $at = $this->between($f['at']->copy()->addMinutes(5), $f['at']->copy()->addDays(6)->min($this->now->copy()->subHour()));
            $source = $this->pick(['profile' => 45, 'post' => 25, 'series' => 15, 'feed' => 10, 'messages' => 5]);
            $payment = $this->pay($f['user'], Payment::SUBSCRIPTION, $price, $at, [
                'months' => 1, 'source' => $source, 'referrer' => $f['referrer'],
                'source_id' => match ($source) {
                    'post' => collect([$posts['eagle'], $posts['behind'], $posts['notes']])->random()->id,
                    'series' => $series,
                    default => null,
                },
            ]);
            DB::table('subscriptions')->updateOrInsert(
                ['user_id' => $f['user']->id, 'creator_profile_id' => $this->creator->id],
                ['expires_at' => $at->copy()->addDays((int) config('creators.subscription_days')), 'auto_renew' => mt_rand(0, 1), 'created_at' => $at, 'updated_at' => $at],
            );
            $subscribers[$f['user']->id] = $f['user'];
            unset($payment);
        }

        return $subscribers;
    }

    private function tipsAndPurchases(array $followers, array $subscribers, array $posts): void
    {
        $people = collect($followers)->pluck('user');
        foreach ($people->random(min(10, $people->count())) as $fan) {
            $post = mt_rand(0, 1) ? collect($posts)->except(['scheduled', 'qa_next'])->random() : null;
            $at = $this->between(($post?->created_at ?? $this->now->copy()->subDays(25))->copy(), $this->now->copy()->subMinutes(30));
            $this->pay($fan, Payment::TIP, [2000, 3000, 5000, 10000, 20000][mt_rand(0, 4)], $at, ['post_id' => $post?->id, 'note' => self::TIP_NOTES[mt_rand(0, count(self::TIP_NOTES) - 1)]]);
        }
        foreach (['ppv1' => 7, 'ppv2' => 4] as $key => $n) {
            $post = $posts[$key];
            foreach ($people->random(min($n, $people->count())) as $fan) {
                $at = $this->between($post->created_at, $this->now->copy()->subMinutes(20));
                $payment = $this->pay($fan, Payment::PPV, (int) $post->price, $at, ['post_id' => $post->id]);
                DB::table('purchases')->insertOrIgnore(['user_id' => $fan->id, 'post_id' => $post->id, 'payment_id' => $payment->id, 'created_at' => $at, 'updated_at' => $at]);
            }
        }
    }

    /** Views, likes, comments, bookmarks and poll votes, from people who could see each post. */
    private function engagement(array $followers, array $subscribers, array $posts): void
    {
        $fans = collect($followers)->pluck('user');
        $buyers = DB::table('purchases')->whereIn('post_id', collect($posts)->pluck('id'))->get()->groupBy('post_id');
        foreach ($posts as $key => $post) {
            if ($post->publish_at) {
                continue;
            }
            $audience = match (true) {
                (bool) $post->price => $fans->filter(fn ($u) => isset($subscribers[$u->id]) || $buyers->get($post->id)?->contains('user_id', $u->id)),
                $post->visibility === Post::SUBSCRIBERS => $fans->filter(fn ($u) => isset($subscribers[$u->id])),
                default => $fans,
            };
            // Views: fans on a few days after posting, plus visitors who aren't signed in for free posts.
            $views = [];
            $age = max(1, (int) $post->created_at->diffInDays($this->now));
            foreach ($audience as $u) {
                foreach (range(0, min($age, mt_rand(0, 3))) as $d) {
                    $views[] = ['post_id' => $post->id, 'viewer' => (string) $u->id, 'day' => $post->created_at->copy()->addDays($d)->min($this->now)->toDateString()];
                }
            }
            if ($post->visibility === Post::PUBLIC && ! $post->price) {
                foreach (range(1, mt_rand(25, 90)) as $g) {
                    $views[] = ['post_id' => $post->id, 'viewer' => 's:demo'.$post->id.'-'.$g, 'day' => $post->created_at->copy()->addDays(mt_rand(0, min($age, 6)))->min($this->now)->toDateString()];
                }
            }
            DB::table('post_views')->insertOrIgnore($views);

            $likers = $audience->filter(fn () => mt_rand(1, 100) <= 55);
            DB::table('post_likes')->insertOrIgnore($likers->map(fn ($u) => [
                'user_id' => $u->id, 'post_id' => $post->id, 'created_at' => $t = $this->between($post->created_at, $this->now), 'updated_at' => $t,
            ])->values()->all());
            DB::table('bookmarks')->insertOrIgnore($audience->filter(fn () => mt_rand(1, 100) <= 12)->map(fn ($u) => [
                'user_id' => $u->id, 'post_id' => $post->id, 'created_at' => $this->now, 'updated_at' => $this->now,
            ])->values()->all());
            foreach ($audience->isEmpty() ? [] : $audience->random(min($audience->count(), mt_rand(1, 5))) as $u) {
                $at = $this->between($post->created_at, $this->now);
                DB::table('post_comments')->insert(['post_id' => $post->id, 'user_id' => $u->id, 'body' => self::COMMENTS[mt_rand(0, count(self::COMMENTS) - 1)], 'created_at' => $at, 'updated_at' => $at]);
            }
            if ($post->poll_options) {
                DB::table('post_poll_votes')->insertOrIgnore($audience->filter(fn () => mt_rand(1, 100) <= 70)->map(fn ($u) => [
                    'post_id' => $post->id, 'user_id' => $u->id, 'option_index' => (int) $this->pick(['0' => 35, '1' => 40, '2' => 10, '3' => 15]),
                ])->values()->all());
            }
        }
        // The creator answers a couple of comments.
        $comment = DB::table('post_comments')->where('post_id', $posts['hello']->id)->first();
        if ($comment) {
            DB::table('post_comments')->insert(['post_id' => $posts['hello']->id, 'user_id' => $this->creator->user_id, 'parent_id' => $comment->id, 'body' => 'Баярлалаа 🙏', 'created_at' => $this->now, 'updated_at' => $this->now]);
        }
    }

    /** Reminders, questions and votes on the three Q&As; the ended one is answered. */
    private function qas(array $followers, array $subscribers, array $posts): void
    {
        $fans = collect($followers)->pluck('user');
        $answers = ['Sony A7 IV, гэхдээ утсаараа ч их авдаг 📱', 'Lightroom дээр, гэрлийг л голчлон засдаг.', 'Анх утсаараа л эхэлсэн, 5 жилийн өмнө.', 'Говь! Ялангуяа Хонгорын элс.', 'Тийм ээ, мессеж бичээрэй 🙌'];
        foreach (['qa_ended' => [16, 8, true], 'qa_live' => [12, 6, null], 'qa_next' => [19, 5, false]] as $key => [$rsvps, $questions, $answered]) {
            $post = $posts[$key];
            DB::table('qa_rsvps')->insertOrIgnore($fans->random(min($rsvps, $fans->count()))->map(fn ($u) => [
                'post_id' => $post->id, 'user_id' => $u->id, 'created_at' => $this->between($post->created_at, $post->qa_starts_at->copy()->min($this->now)),
            ])->values()->all());
            $texts = collect(self::QUESTIONS)->shuffle()->take($questions)->values();
            foreach ($texts as $i => $body) {
                $asker = $fans->random();
                $q = QaQuestion::forceCreate([
                    'post_id' => $post->id, 'user_id' => $asker->id, 'body' => $body,
                    'created_at' => $this->between($post->created_at, $post->qa_starts_at->copy()->min($this->now)), 'updated_at' => $this->now,
                ]);
                $voters = $fans->reject(fn ($u) => $u->id === $asker->id)->random(min(mt_rand(0, 9), $fans->count() - 1));
                DB::table('qa_question_votes')->insertOrIgnore($voters->map(fn ($u) => ['qa_question_id' => $q->id, 'user_id' => $u->id])->values()->all());
                $q->forceFill(['votes_count' => $voters->count()]);
                if ($answered === true || ($answered === null && $i < 2)) {
                    $q->forceFill(['answer' => $answers[$i % count($answers)], 'answered_at' => $post->qa_starts_at->copy()->addMinutes(5 + $i * 6)->min($this->now)]);
                }
                $q->save();
            }
        }
    }

    /** Page visits for the conversion insights: every follower's visit plus visitors who didn't follow. */
    private function visits(array $followers, array $posts): void
    {
        $series = $this->creator->series()->where('title', 'Наадмын өдрүүд')->value('id');
        $rows = [];
        foreach ($followers as $f) {
            $rows[] = ['creator_profile_id' => $this->creator->id, 'page' => 'profile', 'page_id' => 0, 'viewer' => (string) $f['user']->id, 'referrer' => $f['referrer'], 'day' => $f['at']->toDateString()];
            if (mt_rand(1, 100) <= 30) {
                $rows[] = ['creator_profile_id' => $this->creator->id, 'page' => 'series', 'page_id' => $series, 'viewer' => (string) $f['user']->id, 'referrer' => $f['referrer'], 'day' => $f['at']->toDateString()];
            }
        }
        foreach (range(1, 260) as $g) {
            $page = mt_rand(1, 100) <= 85 ? ['profile', 0] : ['series', $series];
            $rows[] = [
                'creator_profile_id' => $this->creator->id, 'page' => $page[0], 'page_id' => $page[1], 'viewer' => 's:demo-v'.$g,
                'referrer' => $this->pick(['instagram.com' => 34, 'facebook.com' => 18, 'ref:story' => 8, 'tiktok.com' => 9, 'app:discover' => 12, 'app:search' => 6, 'google.com' => 5, 'direct' => 8]),
                'day' => $this->now->copy()->subDays(mt_rand(0, 29))->toDateString(),
            ];
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('page_visits')->insertOrIgnore($chunk);
        }
    }

    /** The creator's bell: the most recent follows, subscriptions and tips. */
    private function notifications(): void
    {
        $events = DB::table('follows')->where('creator_profile_id', $this->creator->id)->latest()->take(8)->get()
            ->map(fn ($f) => ['type' => 'followed', 'actor' => $f->user_id, 'at' => $f->created_at, 'data' => []])
            ->merge(Payment::where('creator_profile_id', $this->creator->id)->whereIn('purpose', [Payment::SUBSCRIPTION, Payment::TIP, Payment::PPV])->latest('paid_at')->take(10)->get()
                ->map(fn (Payment $p) => [
                    'type' => match ($p->purpose) {
                        Payment::TIP => 'tipped', Payment::PPV => 'purchased', default => 'subscribed'
                    },
                    'actor' => $p->user_id, 'at' => $p->paid_at, 'data' => array_filter(['amount' => $p->amount, 'note' => $p->note, 'post_id' => $p->post_id]),
                ]));
        DB::table('notifications')->insert($events->map(fn ($e) => [
            'id' => (string) Str::uuid(), 'type' => $e['type'], 'notifiable_type' => User::class, 'notifiable_id' => $this->creator->user_id,
            'data' => json_encode(['actor_id' => $e['actor'], ...$e['data']]), 'read_at' => Carbon::parse($e['at'])->lt($this->now->copy()->subDays(2)) ? $this->now : null,
            'created_at' => $e['at'], 'updated_at' => $e['at'],
        ])->values()->all());
    }
}
