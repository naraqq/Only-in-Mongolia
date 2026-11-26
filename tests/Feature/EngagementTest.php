<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\PostComment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EngagementTest extends TestCase
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

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_likes_toggle_and_show_on_posts(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Hi', 'visibility' => Post::PUBLIC]);
        [$a, $b] = [$this->fan(), $this->fan()];

        $this->actingAs($a)->postJson("/posts/{$post->id}/like")->assertJson(['liked' => true, 'likes_count' => 1]);
        $this->actingAs($b)->postJson("/posts/{$post->id}/like")->assertJson(['liked' => true, 'likes_count' => 2]);
        $this->actingAs($a)->postJson("/posts/{$post->id}/like")->assertJson(['liked' => false, 'likes_count' => 1]);

        $this->actingAs($b)->get('/@artist')->assertInertia(fn ($p) => $p->where('posts.0.likes_count', 1)->where('posts.0.liked', true));
        $this->actingAs($a)->get('/@artist')->assertInertia(fn ($p) => $p->where('posts.0.liked', false));
    }

    public function test_locked_posts_cannot_be_liked_commented_or_saved(): void
    {
        $post = $this->creator()->posts()->create(['body' => 'Secret', 'visibility' => Post::SUBSCRIBERS]);
        $fan = $this->fan();

        $this->actingAs($fan)->postJson("/posts/{$post->id}/like")->assertNotFound();
        $this->postJson("/posts/{$post->id}/comments", ['body' => 'x'])->assertNotFound();
        $this->getJson("/posts/{$post->id}/comments")->assertNotFound();
        $this->postJson("/posts/{$post->id}/bookmark")->assertNotFound();
        auth()->logout();
        $this->postJson("/posts/{$post->id}/like")->assertUnauthorized();
    }

    public function test_comments_notify_the_creator_and_can_be_deleted_by_the_right_people(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Hi', 'visibility' => Post::PUBLIC]);
        [$fan, $other] = [$this->fan(), $this->fan()];

        $this->actingAs($fan)->postJson("/posts/{$post->id}/comments", ['body' => ''])->assertUnprocessable();
        $id = $this->postJson("/posts/{$post->id}/comments", ['body' => 'Гоё байна!'])->assertCreated()
            ->assertJsonPath('comment.body', 'Гоё байна!')->assertJsonPath('comment.can_delete', true)->json('comment.id');
        $this->assertSame(1, $creator->user->notifications()->where('type', 'commented')->count());

        $this->getJson("/posts/{$post->id}/comments")->assertJsonCount(1, 'comments');
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('posts.0.comments_count', 1));

        // The creator commenting on their own post isn't news to them.
        $this->actingAs($creator->user)->postJson("/posts/{$post->id}/comments", ['body' => 'Thanks!'])->assertCreated();
        $this->assertSame(1, $creator->user->notifications()->count());

        $this->actingAs($other)->deleteJson("/comments/{$id}")->assertForbidden();
        $this->actingAs($creator->user)->deleteJson("/comments/{$id}")->assertOk(); // creators moderate their own posts
        $this->assertSame(1, PostComment::count());
    }

    public function test_saved_posts_page_and_most_liked_sort(): void
    {
        $creator = $this->creator();
        $older = $creator->posts()->create(['body' => 'Older', 'visibility' => Post::PUBLIC]);
        $newer = $creator->posts()->create(['body' => 'Newer', 'visibility' => Post::PUBLIC]);
        $fan = $this->fan();
        $older->likes()->attach([$fan->id, $this->fan()->id]);

        $this->actingAs($fan)->postJson("/posts/{$older->id}/bookmark")->assertJson(['bookmarked' => true]);
        $this->get('/saved')->assertInertia(fn ($p) => $p->component('bookmarks')->has('posts', 1)
            ->where('posts.0.id', $older->id)->where('posts.0.bookmarked', true)->where('posts.0.author.handle', 'artist'));
        $this->postJson("/posts/{$older->id}/bookmark")->assertJson(['bookmarked' => false]);
        $this->get('/saved')->assertInertia(fn ($p) => $p->has('posts', 0));

        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('sort', 'new')->where('posts.0.id', $newer->id));
        $this->get('/@artist?sort=popular')->assertInertia(fn ($p) => $p->where('sort', 'popular')->where('posts.0.id', $older->id));
    }

    public function test_replies_stay_one_level_deep_follow_their_comment_and_notify_its_author(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Hi', 'visibility' => Post::PUBLIC]);
        [$a, $b] = [$this->fan(), $this->fan()];

        $first = $this->actingAs($a)->postJson("/posts/{$post->id}/comments", ['body' => 'First'])->json('comment.id');
        $second = $this->postJson("/posts/{$post->id}/comments", ['body' => 'Second'])->json('comment.id');
        $reply = $this->actingAs($b)->postJson("/posts/{$post->id}/comments", ['body' => 'Reply', 'parent_id' => $first])
            ->assertCreated()->assertJsonPath('comment.parent_id', $first)->json('comment.id');
        // Replying to a reply joins the same thread.
        $this->postJson("/posts/{$post->id}/comments", ['body' => 'Reply 2', 'parent_id' => $reply])->assertJsonPath('comment.parent_id', $first);

        // Each comment is followed by its replies.
        $this->getJson("/posts/{$post->id}/comments")->assertJsonPath('comments.*.body', ['First', 'Reply', 'Reply 2', 'Second']);

        $this->assertSame(2, $a->notifications()->where('type', 'replied')->count());
        $this->assertSame(4, $creator->user->notifications()->where('type', 'commented')->count());

        // A comment from another post can't be a parent; deleting a comment takes its replies.
        $other = $creator->posts()->create(['body' => 'Other', 'visibility' => Post::PUBLIC]);
        $this->postJson("/posts/{$other->id}/comments", ['body' => 'x', 'parent_id' => $first])->assertNotFound();
        $this->actingAs($a)->deleteJson("/comments/{$first}")->assertOk();
        $this->assertSame([$second], PostComment::pluck('id')->all());
    }

    public function test_comments_can_be_liked_by_people_who_can_see_the_post(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Hi', 'visibility' => Post::PUBLIC]);
        [$a, $b] = [$this->fan(), $this->fan()];
        $id = $this->actingAs($a)->postJson("/posts/{$post->id}/comments", ['body' => 'Nice'])->json('comment.id');

        $this->actingAs($b)->postJson("/comments/{$id}/like")->assertJson(['liked' => true, 'likes_count' => 1]);
        $this->actingAs($a)->postJson("/comments/{$id}/like")->assertJson(['liked' => true, 'likes_count' => 2]);
        $this->actingAs($b)->postJson("/comments/{$id}/like")->assertJson(['liked' => false, 'likes_count' => 1]);
        $this->actingAs($a)->getJson("/posts/{$post->id}/comments")->assertJsonPath('comments.0.likes_count', 1)->assertJsonPath('comments.0.liked', true);
        $this->actingAs($b)->getJson("/posts/{$post->id}/comments")->assertJsonPath('comments.0.liked', false);

        // Once the post is for subscribers only, outsiders can't like its comments.
        $post->update(['visibility' => Post::SUBSCRIBERS]);
        $this->actingAs($b)->postJson("/comments/{$id}/like")->assertNotFound();
    }
}
