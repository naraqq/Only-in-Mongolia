<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\User;
use App\Payments\FakeGateway;
use App\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WelcomeTest extends TestCase
{
    use RefreshDatabase;

    private CreatorProfile $creator;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->creator = User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone', 'trial_days' => 7,
        ]);
    }

    private function subscribe(User $fan): void
    {
        $payment = app(Payments::class)->startSubscription($fan, $this->creator);
        FakeGateway::markPaid($payment);
        app(Payments::class)->settle($payment);
    }

    private function welcomes(User $fan): \Illuminate\Support\Collection
    {
        return Conversation::between($this->creator->user, $fan)->messages()->where('kind', 'welcome')->get();
    }

    public function test_new_subscribers_get_the_welcome_once_with_locked_library_media(): void
    {
        $this->actingAs($this->creator->user)->post(route('studio.library.store'), ['media' => [UploadedFile::fake()->image('a.jpg')]]);
        $item = $this->creator->vaultItems()->sole();
        $this->put(route('studio.welcome'), ['enabled' => true, 'body' => 'Welcome!', 'vault' => [$item->id], 'price' => 7000])
            ->assertSessionHasNoErrors();

        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->subscribe($fan);
        $welcome = $this->welcomes($fan)->sole();
        $this->assertSame('Welcome!', $welcome->body);
        $this->assertSame(7000, $welcome->price);
        $this->assertSame($item->path, $welcome->media()->sole()->path);
        $this->assertFalse($welcome->isUnlockedFor($fan));

        // Renewing, or coming back after it ended, doesn't send it again.
        $this->subscribe($fan);
        $this->creator->subscriptions()->where('user_id', $fan->id)->update(['expires_at' => now()->subDay()]);
        $this->subscribe($fan);
        $this->assertCount(1, $this->welcomes($fan));

        // The studio shows how it's doing.
        $this->actingAs($this->creator->user)->get(route('studio.promotions'))->assertInertia(fn ($p) => $p
            ->where('welcome.enabled', true)->where('welcome.sent', 1)->where('welcome.items.0.id', $item->id));
    }

    public function test_free_trials_are_welcomed_and_a_removed_file_still_sends_the_words(): void
    {
        $this->actingAs($this->creator->user)->post(route('studio.library.store'), ['media' => [UploadedFile::fake()->image('a.jpg')]]);
        $item = $this->creator->vaultItems()->sole();
        $this->put(route('studio.welcome'), ['enabled' => true, 'body' => 'Hi there', 'vault' => [$item->id]]);
        $this->delete(route('studio.library.destroy', $item));

        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($fan)->post(route('creator.trial', 'artist'))->assertSessionHasNoErrors();
        $welcome = $this->welcomes($fan)->sole();
        $this->assertSame('Hi there', $welcome->body);
        $this->assertSame(0, $welcome->media()->count());
    }

    public function test_off_or_empty_welcomes_send_nothing(): void
    {
        $this->actingAs($this->creator->user)->put(route('studio.welcome'), ['enabled' => true, 'body' => ''])->assertSessionHasErrors('body');
        $this->put(route('studio.welcome'), ['enabled' => false, 'body' => 'Saved for later'])->assertSessionHasNoErrors();

        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->subscribe($fan);
        $this->assertSame(0, Message::count());
    }
}
