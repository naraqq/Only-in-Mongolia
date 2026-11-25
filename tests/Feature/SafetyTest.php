<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SafetyTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle = 'artist'): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_reports_are_filed_once_and_only_on_what_you_can_see(): void
    {
        $creator = $this->creator();
        $public = $creator->posts()->create(['body' => 'x', 'visibility' => Post::PUBLIC]);
        $locked = $creator->posts()->create(['body' => 'y', 'visibility' => Post::SUBSCRIBERS]);
        $fan = $this->fan();

        $this->actingAs($fan)->postJson('/reports', ['type' => 'post', 'id' => $public->id, 'reason' => 'spam'])->assertCreated();
        $this->postJson('/reports', ['type' => 'post', 'id' => $public->id, 'reason' => 'spam'])->assertCreated(); // no duplicate
        $this->postJson('/reports', ['type' => 'post', 'id' => $locked->id, 'reason' => 'spam'])->assertNotFound();
        $this->postJson('/reports', ['type' => 'post', 'id' => $public->id, 'reason' => 'boring'])->assertUnprocessable();
        $this->postJson('/reports', ['type' => 'creator', 'id' => $creator->id, 'reason' => 'minor', 'details' => 'Looks 15'])->assertCreated();

        $this->assertSame(2, Report::count());
    }

    public function test_admins_see_urgent_reports_first_and_can_remove_or_suspend(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Bad', 'visibility' => Post::PUBLIC]);
        [$a, $b] = [$this->fan(), $this->fan()];
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($a)->postJson('/reports', ['type' => 'post', 'id' => $post->id, 'reason' => 'spam']);
        $this->actingAs($b)->postJson('/reports', ['type' => 'post', 'id' => $post->id, 'reason' => 'harassment']);
        $this->actingAs($b)->postJson('/reports', ['type' => 'creator', 'id' => $creator->id, 'reason' => 'nonconsensual']);

        $this->actingAs($a)->get('/admin/reports')->assertForbidden();
        $this->actingAs($admin)->get('/@artist')->assertInertia(fn ($p) => $p->where('openReports', 3));
        $this->get('/admin/reports')->assertInertia(fn ($p) => $p
            ->has('open', 3)->where('open.0.reason', 'nonconsensual')->where('open.0.urgent', true)->where('open.1.preview.text', 'Bad'));

        // Removing the post resolves both reports about it.
        $first = Report::where('reason', 'spam')->first();
        $this->post("/admin/reports/{$first->id}/act", ['action' => 'remove', 'note' => 'spam'])->assertRedirect();
        $this->assertNull(Post::find($post->id));
        $this->assertSame(2, Report::where('status', 'actioned')->count());
        $this->post("/admin/reports/{$first->id}/act", ['action' => 'dismiss'])->assertStatus(409);

        // Suspending hides the page and the studio until reinstated.
        $this->post('/admin/reports/'.Report::where('status', 'open')->sole()->id.'/act', ['action' => 'suspend']);
        $this->assertSame('suspended', $creator->fresh()->status);
        $this->actingAs($a)->get('/@artist')->assertNotFound();
        $this->actingAs($creator->user)->get('/studio')->assertForbidden();

        $this->actingAs($admin)->post("/admin/creators/{$creator->id}/reinstate")->assertRedirect();
        $this->actingAs($a)->get('/@artist')->assertOk();
    }

    public function test_blocking_stops_messages_and_hides_the_creator_from_the_fan(): void
    {
        $creator = $this->creator();
        $fan = $this->fan();
        $fan->following()->attach($creator->id);
        $conversation = Conversation::between($fan, $creator->user);
        $this->actingAs($fan)->post("/messages/{$conversation->id}", ['body' => 'hi'])->assertSessionHasNoErrors();

        // The creator blocks the fan.
        $this->actingAs($creator->user)->postJson("/users/{$fan->id}/block")->assertJson(['blocked' => true]);
        $this->actingAs($fan)->post("/messages/{$conversation->id}", ['body' => 'hello?'])->assertSessionHasErrors(['body' => 'cannot.blocked']);
        $this->actingAs($creator->user)->post("/messages/{$conversation->id}", ['body' => 'x'])->assertSessionHasErrors(['body' => 'cannot.blocked']);
        $this->actingAs($fan)->get('/@artist')->assertNotFound();
        $this->post('/@artist/subscribe')->assertNotFound();
        $this->post('/@artist/tip', ['amount' => 5000])->assertNotFound();
        $this->post('/@artist/follow')->assertNotFound();

        $this->actingAs($creator->user)->get('/settings')->assertInertia(fn ($p) => $p->has('blocked', 1)->where('blocked.0.id', $fan->id));
        $this->get("/messages/{$conversation->id}")->assertInertia(fn ($p) => $p->where('thread.iBlocked', true)->where('thread.cannotSend', 'blocked'));

        // Unblocking restores things.
        $this->postJson("/users/{$fan->id}/block")->assertJson(['blocked' => false]);
        $this->actingAs($fan)->get('/@artist')->assertOk();
    }

    public function test_blocking_a_creator_unfollows_them_and_hides_them_from_suggestions(): void
    {
        $creator = $this->creator();
        $fan = $this->fan();
        $fan->following()->attach($creator->id);

        $this->actingAs($fan)->postJson("/users/{$creator->user_id}/block")->assertJson(['blocked' => true]);
        $this->assertSame(0, $fan->following()->count());
        $this->get('/')->assertInertia(fn ($p) => $p->has('suggestions', 0));
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('blocked', true)); // the fan can still see a page they blocked
        $this->postJson("/users/{$fan->id}/block")->assertUnprocessable();
    }
}
