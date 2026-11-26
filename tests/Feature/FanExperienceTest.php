<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_series_orders_episodes_and_preserves_post_access_and_ownership(): void
    {
        $creator = $this->creator('artist');
        $other = $this->creator('other');
        $intro = $creator->posts()->create(['body' => 'Introduction', 'visibility' => Post::PUBLIC]);
        $locked = $creator->posts()->create(['body' => 'Subscriber lesson', 'visibility' => Post::SUBSCRIBERS]);
        $foreign = $other->posts()->create(['body' => 'Other creator', 'visibility' => Post::PUBLIC]);
        $data = ['title' => 'Drawing lessons', 'featured' => true, 'post_ids' => [$intro->id, $locked->id]];

        $this->actingAs($creator->user)->post('/studio/series', [...$data, 'post_ids' => [$foreign->id]])->assertSessionHasErrors('post_ids');
        $this->post('/studio/series', $data)->assertRedirect('/studio/series');
        $series = $creator->series()->sole();
        $path = "/studio/series/{$series->id}";
        $this->get('/studio/series')->assertInertia(fn ($p) => $p->component('studio/series')->where('series.0.post_ids', $data['post_ids']));
        $this->patch($path, [...$data, 'post_ids' => [$locked->id, $intro->id]])->assertRedirect('/studio/series');
        $this->assertTrue($series->refresh()->featured);

        $this->actingAs($other->user)->patch($path, $data)->assertNotFound();
        $this->delete($path)->assertNotFound();
        auth()->logout();
        $this->get('/@artist?tab=series')->assertInertia(fn ($p) => $p->where('collections.0.posts_count', 2));
        $this->get("/@artist/series/{$series->id}")->assertInertia(fn ($p) => $p->component('creator/series')
            ->where('posts.0.id', $locked->id)
            ->where('posts.0.locked', 'subscribe')
            ->where('posts.0.body', null)
            ->where('posts.1.body', $intro->body));

        $this->actingAs($creator->user)->delete($path)->assertRedirect('/studio/series');
        $this->assertDatabaseHas('posts', ['id' => $locked->id]);
        $this->get("/@artist/series/{$series->id}")->assertNotFound();
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

    public function test_polls_enforce_post_access_save_one_vote_and_link_a_published_follow_up(): void
    {
        $creator = $this->creator('artist');
        $other = $this->creator('other');
        $fan = $this->fan();
        $this->actingAs($creator->user)->post('/studio/posts', [
            'body' => 'What should I draw next?',
            'visibility' => Post::SUBSCRIBERS,
            'poll_options' => ['Mountains', 'City'],
        ])->assertSessionHasNoErrors();
        $poll = $creator->posts()->firstOrFail();
        $vote = "/posts/{$poll->id}/poll/vote";
        $link = "/posts/{$poll->id}/poll/follow-up";

        $this->postJson($vote, ['option' => 0])->assertForbidden();
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($page) => $page->where('posts.0.poll', null));
        $this->postJson($vote, ['option' => 0])->assertNotFound();
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addWeek()]);
        $this->postJson($vote, ['option' => 2])->assertUnprocessable();
        $this->postJson($vote, ['option' => 0])->assertOk()->assertJsonPath('poll.selected', 0)->assertJsonPath('poll.options.0.votes', 1);
        $this->postJson($vote, ['option' => 1])->assertOk()->assertJsonPath('poll.selected', 0)->assertJsonPath('poll.options.1.votes', 0);
        $this->assertDatabaseCount('post_poll_votes', 1);

        $followUp = $creator->posts()->create(['body' => 'The finished mountain drawing', 'visibility' => Post::PUBLIC]);
        $unrelated = $other->posts()->create(['body' => 'Other creator', 'visibility' => Post::PUBLIC]);
        $this->post($link, ['post_id' => $followUp->id])->assertNotFound();
        $this->actingAs($creator->user)->post($link, ['post_id' => $unrelated->id])->assertNotFound();
        $this->post($link, ['post_id' => $followUp->id])->assertSessionHasNoErrors();
        $this->actingAs($fan)->get("/@artist?focus={$poll->id}")->assertInertia(fn ($page) => $page
            ->where('posts.0.poll.follow_up_id', $followUp->id)->where('posts.0.poll.selected', 0));
        $this->get("/@artist?focus={$followUp->id}")->assertInertia(fn ($page) => $page->where('posts.0.id', $followUp->id));
    }

    public function test_global_search_ranks_exact_handles_and_excludes_inaccessible_posts(): void
    {
        $artist = $this->creator('saraa', name: 'Saraa Art');
        $related = $this->creator('saraa-studio');
        $blocked = $this->creator('saraa-private');
        $adult = $this->creator('saraa-adult', adult: true);
        $suspended = $this->creator('saraa-suspended', status: CreatorProfile::SUSPENDED);
        $fan = $this->fan();
        DB::table('blocks')->insert(['blocker_id' => $blocked->user_id, 'blocked_id' => $fan->id]);

        $free = $artist->posts()->create(['body' => 'Ink workshop', 'visibility' => Post::PUBLIC]);
        $artist->posts()->create(['body' => 'Saraa private ink', 'visibility' => Post::SUBSCRIBERS]);
        $artist->posts()->create(['body' => 'Saraa paid ink', 'visibility' => Post::PUBLIC, 'price' => 5000]);
        $artist->posts()->create(['body' => 'Saraa future ink', 'visibility' => Post::PUBLIC, 'publish_at' => now()->addDay()]);
        $artist->posts()->create(['body' => 'Saraa adult ink', 'visibility' => Post::PUBLIC, 'is_adult' => true]);
        $artist->posts()->create(['body' => 'Saraa held ink', 'visibility' => Post::PUBLIC])->forceFill(['held_at' => now()])->save();
        foreach ([$blocked, $adult, $suspended] as $creator) {
            $creator->posts()->create(['body' => 'Saraa ink', 'visibility' => Post::PUBLIC]);
        }

        $this->actingAs($fan)->get('/search?q=%40saraa')->assertInertia(fn ($result) => $result
            ->component('search')
            ->has('creators', 2)
            ->where('creators.0.handle', $artist->handle)
            ->where('creators.1.handle', $related->handle)
            ->has('posts', 1)
            ->where('posts.0.id', $free->id)
            ->where('posts.0.body', 'Ink workshop'));

        $this->get('/search?q=%25')->assertInertia(fn ($result) => $result->has('creators', 0)->has('posts', 0));
    }

    public function test_global_search_filters_post_age_and_media_and_paginates(): void
    {
        $creator = $this->creator('food');
        for ($i = 0; $i < 13; $i++) {
            $creator->posts()->create(['body' => 'Recipe '.$i, 'visibility' => Post::PUBLIC]);
        }
        $photo = $creator->posts()->create(['body' => 'Recipe photo', 'visibility' => Post::PUBLIC]);
        $photo->media()->create(['type' => 'image', 'path' => 'photo.jpg', 'mime' => 'image/jpeg', 'position' => 0]);
        $old = $creator->posts()->create(['body' => 'Recipe old photo', 'visibility' => Post::PUBLIC]);
        $old->forceFill(['created_at' => now()->subMonths(2)])->save();
        $old->media()->create(['type' => 'image', 'path' => 'old.jpg', 'mime' => 'image/jpeg', 'position' => 0]);

        $this->get('/search?q=recipe&tab=posts&media=image&date=week')->assertInertia(fn ($result) => $result
            ->has('posts', 1)->where('posts.0.id', $photo->id)->has('creators', 0));
        $this->get('/search?q=recipe&tab=posts&sort=latest')->assertInertia(fn ($result) => $result->has('posts', 12)->where('morePosts', true));
        $this->get('/search?q=recipe&tab=posts&sort=latest&page=2')->assertInertia(fn ($result) => $result->has('posts', 3)->where('morePosts', false));
    }

    public function test_first_feed_offers_one_eligible_free_post_per_creator(): void
    {
        config(['starter-feed.topics_by_handle' => ['artist' => 'art', 'musician' => 'music']]);
        $artist = $this->creator('artist');
        $musician = $this->creator('musician');
        $blocked = $this->creator('blocked');
        $adult = $this->creator('adult', adult: true);
        $suspended = $this->creator('suspended', status: CreatorProfile::SUSPENDED);
        $fan = $this->fan();
        DB::table('blocks')->insert(['blocker_id' => $blocked->user_id, 'blocked_id' => $fan->id]);

        $artist->posts()->create(['body' => 'Earlier free post', 'visibility' => Post::PUBLIC]);
        $free = $artist->posts()->create(['body' => 'Latest free post', 'visibility' => Post::PUBLIC]);
        $artist->posts()->create(['body' => 'Subscribers only', 'visibility' => Post::SUBSCRIBERS]);
        $artist->posts()->create(['body' => 'Pay to unlock', 'visibility' => Post::PUBLIC, 'price' => 5000]);
        $artist->posts()->create(['body' => 'Future post', 'visibility' => Post::PUBLIC, 'publish_at' => now()->addDay()]);
        $artist->posts()->create(['body' => '18+ post', 'visibility' => Post::PUBLIC, 'is_adult' => true]);
        $held = $artist->posts()->create(['body' => 'Held post', 'visibility' => Post::PUBLIC]);
        $held->forceFill(['held_at' => now()])->save();
        foreach ([$musician, $blocked, $adult, $suspended] as $creator) {
            $creator->posts()->create(['body' => 'Public post', 'visibility' => Post::PUBLIC]);
        }

        $this->actingAs($fan)->get('/')->assertInertia(fn ($page) => $page
            ->component('feed')
            ->has('posts', 0)
            ->has('starterPosts', 2)
            ->where('starterPosts.0.id', $free->id)
            ->where('starterPosts.0.topic', 'art')
            ->where('starterPosts.0.following', false)
            ->where('starterPosts.1.topic', 'music'));

        $this->post('/@artist/follow?view=starter')->assertRedirect('/?view=starter');
        $this->get('/?view=starter')->assertInertia(fn ($page) => $page
            ->where('followingCount', 1)
            ->where('starterPosts.0.following', true));
        $this->get('/')->assertInertia(fn ($page) => $page->where('starterPosts', null)->has('posts', 5));
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

        // Suggestions are only for the home feed.
        $this->get('/creators')->assertInertia(fn ($p) => $p->has('suggestions', 0));
        $this->get('/@other')->assertInertia(fn ($p) => $p->has('suggestions', 0));
    }

    public function test_posting_from_home_returns_to_home(): void
    {
        $me = $this->creator('me');

        $this->actingAs($me->user)->from('/')->post('/studio/posts', ['body' => 'Hi', 'visibility' => 'public'])->assertRedirect('/');
        $this->assertSame(1, $me->posts()->count());
    }
}
