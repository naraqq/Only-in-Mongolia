<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\User;
use App\Notifications\Activity;
use App\Push\SendPush;
use App\Push\Texts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PushTest extends TestCase
{
    use RefreshDatabase;

    private const SUB = ['endpoint' => 'https://push.example.com/abc', 'keys' => ['p256dh' => 'BPublicKey', 'auth' => 'authToken'], 'contentEncoding' => 'aes128gcm'];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.webpush.public_key' => 'test-public', 'services.webpush.private_key' => 'test-private']);
        if (PHP_OS_FAMILY === 'Windows' && ! getenv('OPENSSL_CONF')) {
            putenv('OPENSSL_CONF=test'); // nothing is really sent here; this only marks push as available
        }
        Queue::fake();
    }

    private function user(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_a_device_subscribes_moves_with_the_account_and_unsubscribes(): void
    {
        [$a, $b] = [$this->user(), $this->user()];

        $this->actingAs($a)->get('/settings')->assertInertia(fn ($p) => $p->where('pushKey', 'test-public'));
        $this->postJson(route('push.subscribe'), self::SUB)->assertNoContent();
        $this->postJson(route('push.subscribe'), self::SUB)->assertNoContent(); // again: still one row
        $this->assertSame(1, $a->pushSubscriptions()->count());

        // The same phone signed in as someone else now belongs to them.
        $this->actingAs($b)->postJson(route('push.subscribe'), self::SUB)->assertNoContent();
        $this->assertSame(0, $a->pushSubscriptions()->count());
        $this->assertSame(1, $b->pushSubscriptions()->count());

        $this->postJson(route('push.subscribe'), ['endpoint' => 'http://insecure.example.com', 'keys' => self::SUB['keys']])->assertUnprocessable();

        $this->deleteJson(route('push.unsubscribe'), ['endpoint' => self::SUB['endpoint']])->assertNoContent();
        $this->assertSame(0, $b->pushSubscriptions()->count());
    }

    public function test_bell_news_and_messages_go_to_phones_that_allowed_it(): void
    {
        $creator = $this->user();
        $creator->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
        $fan = $this->user();

        // No device yet: the bell only.
        $creator->notify(new Activity('followed', $fan->id));
        Queue::assertNothingPushed();

        $this->actingAs($creator)->postJson(route('push.subscribe'), self::SUB);
        $creator->notify(new Activity('tipped', $fan->id, ['amount' => 5000]));
        Queue::assertPushed(SendPush::class, fn (SendPush $job) => $job->userIds === [$creator->id] && $job->key === 'tipped'
            && $job->vars['name'] === $fan->name && $job->vars['amount'] === 5000);

        // A message: the sender's name as the title and the start of the text.
        $conversation = Conversation::between($fan, $creator);
        $this->actingAs($fan)->post(route('messages.send', $conversation), ['body' => 'Сайн байна уу!'])->assertSessionHasNoErrors();
        Queue::assertPushed(SendPush::class, fn (SendPush $job) => $job->key === 'message' && $job->userIds === [$creator->id]
            && $job->title === $fan->name && $job->body === 'Сайн байна уу!' && $job->tag === 'chat-'.$conversation->id);
    }

    public function test_push_is_off_without_keys(): void
    {
        config(['services.webpush.public_key' => null]);
        $user = $this->user();
        $this->actingAs($user)->get('/settings')->assertInertia(fn ($p) => $p->where('pushKey', null));
        $this->postJson(route('push.subscribe'), self::SUB)->assertNotFound();
    }

    public function test_push_text_is_in_the_readers_language(): void
    {
        $this->assertSame(Texts::keys('en'), Texts::keys('mn'));
        $this->assertSame('Bold tipped you ₮5,000', Texts::line('tipped', 'en', ['name' => 'Bold', 'amount' => 5000]));
        $this->assertSame('Bold танд ₮5,000 tip илгээлээ', Texts::line('tipped', null, ['name' => 'Bold', 'amount' => 5000]));

        // Switching language is remembered on the account, for pushes written while away.
        $user = $this->user();
        $this->actingAs($user)->post(route('locale', 'en'));
        $this->assertSame('en', $user->fresh()->locale);
    }
}
