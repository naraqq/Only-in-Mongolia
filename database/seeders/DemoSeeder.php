<?php

namespace Database\Seeders;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Demo content for local development: creators with posts (photos drawn locally with GD, no downloads),
 * a fan account and a creator account you can log into with the dev phone numbers in VERIFY_MN_DEV_PHONES:
 *   99999999 → "Demo Fan" (follows five creators)
 *   88888888 → "Demo Creator" @demo (approved creator and admin)
 * Demo Fan is subscribed to two creators, and @demo has a few paying subscribers (see DemoSubscriptionsSeeder).
 * Run: php artisan migrate:fresh --seed
 */
class DemoSeeder extends Seeder
{
    private int $n = 0;

    private const CREATORS = [
        ['saraa.art', 'Сараа', 'Монгол зураач. Уламжлалт хээг орчин үеийн арт болгодог. 🎨', 9900, [[225, 29, 72], [245, 158, 11]], [
            'Шинэ цуврал: “Талын салхи”. Энэ долоо хоногт 3 зураг нэмнэ.',
            'Ажлын өрөөний минь нэг өглөө ☕',
            'Хээний тойм: өлзий хээ юу гэсэн утгатай вэ? Subscriber-уудад зориулсан бүрэн видео.',
            'Худалдаанд гарсан зургуудын жагсаалт',
            'Үзэсгэлэнгийн ард 🖼️',
        ]],
        ['tuvshin_cooks', 'Түвшин', 'Гэрийн хоолны жор: буузнаас эхлээд Хятад, Солонгос хоол хүртэл. 🥟', 4900, [[234, 88, 12], [250, 204, 21]], [
            'Өнөөдрийн цуйван. Гоймонгоо гараар хийх нь гол нууц.',
            'Цагаан сарын бууз: 200 ширхэгийг 2 цагт 😅',
            'Бүрэн жор: хуушуурын гурил зөөлөн байлгах арга',
            'Хонины махыг хэрхэн зөв сонгох вэ?',
        ]],
        ['gobi.lens', 'Энхжин', 'Говийн гэрэл зурагчин. Аялал, байгаль, од эрхэс. 📷', 14900, [[14, 116, 144], [251, 191, 36]], [
            'Хонгорын элс, нар жаргахаас 10 минутын өмнө.',
            'Говьд шөнө од харах: миний камерын тохиргоо',
            'Ялалт! Энэ зураг маань National-ийн шилдэг 50-д орлоо 🙏',
            'Raw файлууд, subscriber-уудад үнэгүй',
            'Дараагийн аялал: Алтай Таван Богд',
        ]],
        ['temuulen.fit', 'Тэмүүлэн', 'Фитнес дасгалжуулагч. Өдөр бүр 20 минут, тоног төхөөрөмжгүй. 💪', 19900, [[22, 163, 74], [34, 211, 238]], [
            '30 хоногийн сорил эхэллээ! Өнөөдөр 1-р өдөр.',
            'Өвлийн улиралд гадаа гүйх үү, үгүй юу?',
            'Бүтэн хөтөлбөр: эхлэгчдэд 4 долоо хоног',
            'Хоол тэжээл: өдөрт хэдэн грамм уураг хэрэгтэй вэ?',
        ]],
        ['naraa.music', 'Нараа', 'Морин хуур, шинэ дуунууд, студийн ард. 🎻', 7900, [[124, 58, 237], [236, 72, 153]], [
            'Шинэ дууныхаа эхний 30 секундыг хуваалцъя 🎶',
            'Студид өнгөрүүлсэн 12 цаг',
            'Subscriber-уудад: бичлэгийн бүрэн хувилбар',
            'Концертын тасалбар маргааш гарна!',
        ]],
        ['bold.codes', 'Болд', 'Програмчлал заадаг. Laravel, React, анхлан суралцагчдад. 💻', 12900, [[37, 99, 235], [99, 102, 241]], [
            'Анхны вэб сайтаа 1 цагт: үнэгүй хичээл.',
            'Laravel + Inertia төслийн бүтэц, бүрэн видео',
            'Ажлын ширээний setup 2026',
            'Ярилцлагын асуултууд: junior developer',
        ]],
        ['khulan.style', 'Хулан', 'Орчин үеийн дээл, загвар, стайл. Улаанбаатараас. 👗', 9900, [[190, 24, 93], [251, 113, 133]], [
            'Шинэ коллекц: “Хаврын дээл” 🌸',
            'Фото зураг авалтын ард',
            'Subscriber-уудад: хямдралын код',
        ]],
        ['erdene.travel', 'Эрдэнэ', 'Хөвсгөлөөс Алтай хүртэл. Монголоороо аялъя. 🏔️', 5900, [[3, 105, 161], [45, 212, 191]], [
            'Хөвсгөл нуур, 6 сарын эхээр. Ус нь мөстэй хэвээр.',
            'Аялалын төсөв: 7 хоног, 2 хүн',
            'Миний очсон хамгийн гоё 10 газар',
            'Тэрэлжид амралтын өдөр ⛺',
        ]],
    ];

    public function run(): void
    {
        $creators = collect(self::CREATORS)->map(function ($c, $i) {
            [$handle, $name, $bio, $price, $colors, $captions] = $c;
            $profile = $this->creator($this->user($name, null), $handle, $name, $bio, $price, reviewedDaysAgo: 30 - $i);
            foreach ($captions as $j => $caption) {
                $this->post($profile, $caption, $colors, $j, hoursAgo: $i * 3 + $j * 17 + 1);
            }

            return $profile;
        });

        // Followers, so counts and "most followed" mean something.
        User::factory(40)->create(['birthdate' => '1998-01-01'])->each(
            fn (User $u) => $u->following()->attach($creators->random(rand(1, 4))->pluck('id')),
        );

        // Log in as these with the dev phone numbers.
        $fan = $this->user('Demo Fan', '99999999');
        $fan->following()->attach($creators->take(5)->pluck('id'));

        $me = $this->user('Demo Creator', '88888888');
        $me->forceFill(['is_admin' => true])->save();
        $mine = $this->creator($me, 'demo', 'Demo Creator', 'Энэ бол таны туршилтын бүтээгчийн хуудас.', 9900, reviewedDaysAgo: 1);
        $this->post($mine, 'Миний анхны нийтлэл 👋', [[225, 29, 72], [124, 58, 237]], 0, hoursAgo: 2);
        $me->following()->attach($creators->take(3)->pluck('id'));

        $this->call([DemoPhotosSeeder::class, DemoSubscriptionsSeeder::class, DemoMessagesSeeder::class, DemoPayPerViewSeeder::class, DemoEngagementSeeder::class]);
    }

    private function user(string $name, ?string $phone): User
    {
        return User::factory()->create([
            'name' => $name,
            'phone' => $phone,
            'phone_verified_at' => now(),
            'birthdate' => '1995-05-05',
        ]);
    }

    private function creator(User $user, string $handle, string $name, string $bio, int $price, int $reviewedDaysAgo): CreatorProfile
    {
        $this->n++;

        return $user->creatorProfile()->create([
            'handle' => $handle, 'display_name' => $name, 'bio' => $bio, 'price_monthly' => $price, 'adult_content' => false,
            'legal_name' => $name, 'register_number' => 'УБ9505'.str_pad((string) $this->n, 4, '0', STR_PAD_LEFT),
            'id_front_path' => 'demo', 'id_back_path' => 'demo', 'selfie_path' => 'demo',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000'.str_pad((string) $this->n, 6, '0', STR_PAD_LEFT), 'account_holder' => $name,
            'consented_at' => now(), 'status' => CreatorProfile::APPROVED, 'reviewed_at' => now()->subDays($reviewedDaysAgo),
        ]);
    }

    /** First post of each creator is free; then every other one is for subscribers. Most have 1–2 photos. */
    private function post(CreatorProfile $creator, string $body, array $colors, int $j, int $hoursAgo): void
    {
        $post = $creator->posts()->create([
            'body' => $body,
            'visibility' => $j % 2 === 0 ? Post::PUBLIC : Post::SUBSCRIBERS,
            'is_adult' => false,
        ]);
        $post->forceFill(['created_at' => now()->subHours($hoursAgo), 'updated_at' => now()->subHours($hoursAgo)])->saveQuietly();

        $photos = [1, 1, 2, 0, 1][$j % 5];
        for ($k = 0; $k < $photos; $k++) {
            $path = "posts/{$creator->id}/demo-{$post->id}-{$k}.jpg";
            Storage::put($path, $this->picture($colors, seed: $post->id * 7 + $k));
            $post->media()->create(['type' => 'image', 'path' => $path, 'mime' => 'image/jpeg', 'position' => $k]);
        }
    }

    /** A landscape-style picture: colour sky, a sun, and layered hills. */
    private function picture(array $colors, int $seed): string
    {
        mt_srand($seed);
        $w = 1080;
        $h = 1080;
        $img = imagecreatetruecolor($w, $h);
        [$a, $b] = $colors;
        for ($y = 0; $y < $h; $y++) {
            $t = $y / $h;
            $c = imagecolorallocate($img, ...array_map(fn ($i) => (int) ($a[$i] + ($b[$i] - $a[$i]) * $t), [0, 1, 2]));
            imageline($img, 0, $y, $w, $y, $c);
        }
        imagefilledellipse($img, mt_rand(250, 830), mt_rand(250, 450), 220, 220, imagecolorallocatealpha($img, 255, 255, 255, 25));
        for ($layer = 0; $layer < 3; $layer++) {
            $shade = imagecolorallocatealpha($img, 20 + $layer * 10, 20, 40, 60 - $layer * 25);
            $points = [0, $h];
            $base = 620 + $layer * 130;
            for ($x = 0; $x <= $w; $x += 90) {
                array_push($points, $x, $base - mt_rand(0, 160));
            }
            array_push($points, $w, $h);
            imagefilledpolygon($img, $points, $shade);
        }
        ob_start();
        imagejpeg($img, null, 85);
        imagedestroy($img);

        return ob_get_clean();
    }
}
