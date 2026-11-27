<?php

namespace Tests\Feature;

use App\Discovery\Suggestions;
use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** How fans find creators: categories, trending, personal suggestions, and the feed loading more. */
class DiscoveryTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle, array $categories = [], bool $adult = false): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => $adult,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now()->subDays($this->n), 'categories' => $categories ?: null,
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_creators_choose_up_to_two_categories_and_discover_filters_by_them(): void
    {
        $music = $this->creator('naraa');
        $this->creator('saraa', ['art']);
        $this->actingAs($music->user)->patch(route('me.update'), [
            'name' => 'Naraa', 'display_name' => 'Naraa', 'price_monthly' => 10000, 'dm_policy' => 'followers', 'categories' => ['music', 'art', 'travel'],
        ])->assertSessionHasErrors('categories');
        $this->patch(route('me.update'), [
            'name' => 'Naraa', 'display_name' => 'Naraa', 'price_monthly' => 10000, 'dm_policy' => 'followers', 'categories' => ['music', 'nonsense'],
        ])->assertSessionHasErrors('categories.1');
        $this->patch(route('me.update'), [
            'name' => 'Naraa', 'display_name' => 'Naraa', 'price_monthly' => 10000, 'dm_policy' => 'followers', 'categories' => ['music'],
        ])->assertSessionHasNoErrors();
        $this->assertSame(['music'], $music->fresh()->categories);

        $this->get(route('creators', ['category' => 'music']))->assertInertia(fn ($p) => $p
            ->has('creators', 1)->where('creators.0.handle', 'naraa')->where('creators.0.categories', ['music'])
            ->where('categories', ['music', 'art'])); // only categories that have pages
    }

    public function test_trending_puts_momentum_before_size(): void
    {
        $big = $this->creator('big');
        $rising = $this->creator('rising');
        // Big: many followers, all long ago. Rising: a few this week.
        foreach (range(1, 6) as $i) {
            DB::table('follows')->insert(['user_id' => $this->fan()->id, 'creator_profile_id' => $big->id, 'created_at' => now()->subMonths(3), 'updated_at' => now()]);
        }
        foreach (range(1, 3) as $i) {
            DB::table('follows')->insert(['user_id' => $this->fan()->id, 'creator_profile_id' => $rising->id, 'created_at' => now()->subDay(), 'updated_at' => now()]);
        }

        $this->get(route('creators'))->assertInertia(fn ($p) => $p->where('filters.sort', 'trending')->where('creators.0.handle', 'rising'));
        $this->get(route('creators', ['sort' => 'popular']))->assertInertia(fn ($p) => $p->where('creators.0.handle', 'big'));
    }

    public function test_suggestions_are_what_fans_of_the_same_creators_follow_then_same_topics_then_trending(): void
    {
        [$a, $b, $c, $d] = [$this->creator('a', ['music']), $this->creator('b'), $this->creator('c'), $this->creator('d', ['music'])];
        $blocked = $this->creator('blocked');
        $me = $this->fan();
        $me->following()->attach($a->id);
        // Other fans of A also follow B (twice), C (once) and the blocked one (three times).
        foreach ([[$b, $blocked], [$b, $c, $blocked], [$blocked]] as $theirs) {
            $other = $this->fan();
            $other->following()->attach($a->id);
            foreach ($theirs as $creator) {
                $other->following()->attach($creator->id);
            }
        }
        DB::table('blocks')->insert(['blocker_id' => $me->id, 'blocked_id' => $blocked->user_id, 'created_at' => now(), 'updated_at' => now()]);

        $handles = Suggestions::for($me, 3)->pluck('handle')->all();
        $this->assertSame(['b', 'c', 'd'], $handles); // co-followed first (most shared first), then same topic (music)

        // Guests: trending, never 18+ pages.
        $this->creator('adult', [], true);
        $this->assertNotContains('adult', Suggestions::for(null, 10)->pluck('handle')->all());
    }

    public function test_the_feed_loads_more_as_you_scroll_then_suggests_posts(): void
    {
        $followed = $this->creator('followed');
        $other = $this->creator('other');
        $other->posts()->create(['body' => 'Free post', 'visibility' => Post::PUBLIC]);
        $me = $this->fan();
        $me->following()->attach($followed->id);
        foreach (range(1, 25) as $i) {
            $p = $followed->posts()->create(['body' => "Post {$i}", 'visibility' => Post::PUBLIC]);
            $p->forceFill(['created_at' => now()->subMinutes(100 - $i)])->save();
        }

        $first = $this->actingAs($me)->get(route('home'))->assertInertia(fn ($p) => $p->has('posts', 20)->where('posts.0.body', 'Post 25'))
            ->viewData('page')['props']['posts'];
        $more = $this->getJson(route('feed.more', ['before' => end($first)['id']]))->assertOk();
        $this->assertSame(['Post 5', 'Post 4', 'Post 3', 'Post 2', 'Post 1'], array_column($more->json('posts'), 'body'));
        $this->assertTrue($more->json('done'));
        $this->assertSame('Free post', $more->json('suggested.0.body')); // from a creator they don't follow
    }
}
