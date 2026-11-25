<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileEditTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    public function test_anyone_can_set_and_remove_a_profile_photo_which_is_resized_and_re_encoded(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($user)->post('/profile/photo/avatar', ['photo' => UploadedFile::fake()->image('me.png', 1200, 800)])->assertSessionHasNoErrors();
        $path = $user->fresh()->avatar_path;
        Storage::disk('public')->assertExists($path);
        $this->assertStringEndsWith('.jpg', $path);
        $this->assertSame([400, 400], array_slice(getimagesizefromstring(Storage::disk('public')->get($path)), 0, 2));
        $this->get('/profile')->assertInertia(fn ($p) => $p->component('profile/edit')->where('profile.avatar_url', Storage::disk('public')->url($path))->where('creator', null));

        // A new photo replaces the old file.
        $this->post('/profile/photo/avatar', ['photo' => UploadedFile::fake()->image('new.jpg', 500, 500)]);
        Storage::disk('public')->assertMissing($path);

        $this->delete('/profile/photo/avatar');
        $this->assertNull($user->fresh()->avatar_path);
    }

    public function test_non_images_are_rejected_and_everyone_can_have_a_cover(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($user)->post('/profile/photo/avatar', ['photo' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')])->assertSessionHasErrors('photo');
        $this->post('/profile/photo/cover', ['photo' => UploadedFile::fake()->image('c.jpg', 1600, 900)])->assertSessionHasNoErrors();
        $mine = $user->fresh()->cover_path;
        $this->assertNotNull($mine);
        $this->get('/profile')->assertInertia(fn ($p) => $p->where('profile.cover_url', Storage::disk('public')->url($mine)));
        $this->delete('/profile/photo/cover');
        $this->assertNull($user->fresh()->cover_path);
        Storage::disk('public')->assertMissing($mine);

        $creator = $this->creator();
        $this->actingAs($creator->user)->post('/profile/photo/cover', ['photo' => UploadedFile::fake()->image('c.jpg', 1600, 900)])->assertSessionHasNoErrors();
        $cover = $creator->fresh()->cover_path;
        $this->assertSame([1500, 500], array_slice(getimagesizefromstring(Storage::disk('public')->get($cover)), 0, 2));
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('creator.cover_url', Storage::disk('public')->url($cover)));
    }

    public function test_a_cover_picked_before_applying_moves_to_the_creator_page_on_approval(): void
    {
        Storage::fake('public');
        $creator = $this->creator();
        $creator->update(['status' => CreatorProfile::PENDING]);
        $this->actingAs($creator->user)->post('/profile/photo/cover', ['photo' => UploadedFile::fake()->image('c.jpg', 1600, 900)]);
        $path = $creator->user->fresh()->cover_path;

        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->post("/admin/creators/{$creator->id}/decide", ['decision' => 'approved'])->assertSessionHasNoErrors();
        $this->assertSame($path, $creator->fresh()->cover_path);
        $this->assertNull($creator->user->fresh()->cover_path);
    }

    public function test_creators_edit_their_page_and_message_settings(): void
    {
        $creator = $this->creator();

        $this->actingAs($creator->user)->patch('/profile', [
            'name' => 'Bat', 'display_name' => 'Bat Art', 'bio' => 'Hello', 'price_monthly' => 15000, 'dm_policy' => 'subscribers',
        ])->assertSessionHasNoErrors();

        $creator->refresh();
        $this->assertSame(['Bat Art', 'Hello', 15000, 'subscribers', 'Bat'], [$creator->display_name, $creator->bio, $creator->price_monthly, $creator->dm_policy, $creator->user->name]);

        $this->patch('/profile', ['name' => 'Bat', 'display_name' => 'X', 'price_monthly' => 10, 'dm_policy' => 'nobody'])
            ->assertSessionHasErrors(['price_monthly', 'dm_policy']);
    }

    public function test_fans_can_only_change_their_name(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($user)->patch('/profile', ['name' => 'Saraa', 'price_monthly' => 1])->assertSessionHasNoErrors();
        $this->assertSame('Saraa', $user->fresh()->name);
    }
}
