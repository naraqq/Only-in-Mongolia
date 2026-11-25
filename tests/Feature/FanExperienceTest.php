<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FanExperienceTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle, bool $adult = false, string $status = CreatorProfile::APPROVED, string $name = 'Creator'): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => $name, 'bio' => "Bio of {$handle}", 'price_monthly' => 10000, 'adult_content' => $adult,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => $status, 'reviewed_at' => now()->subMinutes(10 - $this->n),
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_home_and_discovery_list_approved_creators_and_hide_18_plus_from_visitors(): void
    {
        $this->creator('artist', name: 'Saraa Art');
        $this->creator('night', adult: true);
        $this->creator('waiting', status: CreatorProfile::PENDING);

        // Visitors: approved, non-18+ only.
        $this->get('/')->assertRedirect('/login'); // visitors log in first
        $this->get('/creators')->assertInertia(fn ($p) => $p->has('creators', 1));

        // Signed-in adults also see 18+ creators.
        $this->actingAs($this->fan())->get('/creators')->assertInertia(fn ($p) => $p->has('creators', 2));
        $this->actingAs($this->fan())->get('/creators?q=saraa')->assertInertia(fn ($p) => $p->has('creators', 1)->where('creators.0.handle', 'artist'));
        $this->actingAs($this->fan())->get('/creators?q=@nig')->assertInertia(fn ($p) => $p->has('creators', 1)->where('creators.0.handle', 'night'));
    }

    public function test_follow_and_unfollow(): void
    {
        $c = $this->creator('artist');
        $fan = $this->fan();

        $this->post('/@artist/follow')->assertRedirect('/login');

        $this->actingAs($fan)->post('/@artist/follow')->assertRedirect();
        $this->actingAs($fan)->post('/@artist/follow'); // twice is still one follow
        $this->assertSame(1, $c->followers()->count());
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->where('following', true)->where('creator.followers_count', 1));
        $this->actingAs($fan)->get('/creators')->assertInertia(fn ($p) => $p->where('creators.0.following', true));

        $this->actingAs($fan)->delete('/@artist/follow');
        $this->assertSame(0, $c->followers()->count());

        // Can't follow yourself, or a creator who isn't approved.
        $this->actingAs($c->user)->post('/@artist/follow')->assertStatus(422);
        $this->creator('waiting', status: CreatorProfile::PENDING);
        $this->actingAs($fan)->post('/@waiting/follow')->assertNotFound();
    }

    public function test_feed_shows_followed_creators_posts_with_the_same_locks(): void
    {
        $followed = $this->creator('artist');
        $other = $this->creator('other');
        $fan = $this->fan();
        $fan->following()->attach($followed->id);

        $free = $followed->posts()->create(['body' => 'Free one', 'visibility' => Post::PUBLIC]);
        $locked = $followed->posts()->create(['body' => 'Secret', 'visibility' => Post::SUBSCRIBERS]);
        $other->posts()->create(['body' => 'Not followed', 'visibility' => Post::PUBLIC]);

        $this->actingAs($fan)->get('/feed')->assertInertia(fn ($p) => $p
            ->component('feed')
            ->has('posts', 2)
            ->where('posts.0.id', $locked->id)
            ->where('posts.0.locked', 'subscribe')
            ->where('posts.0.body', null)
            ->where('posts.0.author.handle', 'artist')
            ->where('posts.1.id', $free->id)
            ->where('posts.1.body', 'Free one')
            ->where('followingCount', 1)
            ->has('suggestions', 1)); // fewer than 3 followed → suggest others

        auth()->logout();
        $this->get('/feed')->assertRedirect('/login');
    }

    public function test_dashboard_lists_who_you_follow(): void
    {
        $c = $this->creator('artist');
        $fan = $this->fan();
        $fan->following()->attach($c->id);

        $this->actingAs($fan)->get('/dashboard')->assertInertia(fn ($p) => $p->has('following', 1)->where('following.0.handle', 'artist')->where('creatorStatus', null));
    }

    public function test_signed_in_home_is_the_feed_including_the_creators_own_posts(): void
    {
        $me = $this->creator('me');
        $followed = $this->creator('artist');
        $this->creator('other');
        $me->user->following()->attach($followed->id);
        $mine = $me->posts()->create(['body' => 'My post', 'visibility' => Post::SUBSCRIBERS]);

        $this->actingAs($me->user)->get('/')->assertInertia(fn ($p) => $p
            ->component('feed')
            ->where('posts.0.id', $mine->id)
            ->where('posts.0.body', 'My post') // creators always see their own posts
            ->where('followingCount', 1)
            ->where('auth.creator.adult_content', false)
            ->has('suggestions', 1) // not themselves, not who they follow
            ->where('suggestions.0.handle', 'other'));
    }

    public function test_posting_from_home_returns_to_home(): void
    {
        $me = $this->creator('me');

        $this->actingAs($me->user)->from('/')->post('/studio/posts', ['body' => 'Hi', 'visibility' => 'public'])->assertRedirect('/');
        $this->assertSame(1, $me->posts()->count());
    }
}
