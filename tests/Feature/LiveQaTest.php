<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\QaQuestion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LiveQaTest extends TestCase
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

    private function qa(CreatorProfile $creator, $startsIn = '+1 hour', int $minutes = 60): Post
    {
        $starts = now()->modify($startsIn);

        return $creator->posts()->create([
            'body' => 'Ask me anything', 'visibility' => Post::PUBLIC, 'qa_starts_at' => $starts, 'qa_ends_at' => $starts->copy()->addMinutes($minutes),
        ]);
    }

    public function test_a_creator_schedules_a_qa_from_the_composer(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user)->post('/studio/posts', [
            'body' => 'Ask me about painting', 'visibility' => 'public', 'qa_starts_at' => now()->addDay()->toIso8601String(), 'qa_minutes' => 45,
        ])->assertSessionHasNoErrors();

        $post = Post::firstOrFail();
        $this->assertSame(45, (int) $post->qa_starts_at->diffInMinutes($post->qa_ends_at));
        $this->assertSame('upcoming', $post->qaState());

        // Not with a price, and not without a topic or a valid length.
        $this->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'price' => 5000, 'qa_starts_at' => now()->addDay()->toIso8601String(), 'qa_minutes' => 30])
            ->assertSessionHasErrors('qa_starts_at');
        $this->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'qa_starts_at' => now()->addDay()->toIso8601String(), 'qa_minutes' => 7])
            ->assertSessionHasErrors('qa_minutes');
    }

    public function test_fans_rsvp_ask_and_upvote_before_it_starts(): void
    {
        $creator = $this->creator();
        $post = $this->qa($creator);
        [$a, $b] = [$this->fan(), $this->fan()];

        $this->actingAs($a)->postJson("/posts/{$post->id}/qa/rsvp", ['on' => true])->assertOk()->assertJsonPath('qa.rsvps', 1)->assertJsonPath('qa.rsvped', true);
        $this->postJson("/posts/{$post->id}/qa/questions", ['body' => 'How do you mix colours?'])->assertOk()->assertJsonPath('qa.list.0.mine', true);
        $question = QaQuestion::firstOrFail();

        $this->actingAs($b)->postJson("/qa-questions/{$question->id}/vote", ['on' => true])->assertJsonPath('qa.list.0.votes', 1);
        $this->postJson("/qa-questions/{$question->id}/vote", ['on' => true])->assertJsonPath('qa.list.0.votes', 1); // once per fan
        $this->actingAs($a)->postJson("/qa-questions/{$question->id}/vote", ['on' => true])->assertNotFound(); // not your own

        // The creator can't answer before it starts, and can't RSVP to their own.
        $this->actingAs($creator->user)->postJson("/qa-questions/{$question->id}/answer", ['answer' => 'Soon'])->assertStatus(422);
        $this->postJson("/posts/{$post->id}/qa/rsvp", ['on' => true])->assertForbidden();
    }

    public function test_one_fan_can_only_have_a_few_open_questions(): void
    {
        $post = $this->qa($this->creator());
        $this->actingAs($this->fan());
        foreach (range(1, 3) as $i) {
            $this->postJson("/posts/{$post->id}/qa/questions", ['body' => "Question {$i}"])->assertOk();
        }
        $this->postJson("/posts/{$post->id}/qa/questions", ['body' => 'One more'])->assertStatus(422);
    }

    public function test_going_live_reminds_rsvps_once_and_answers_notify_the_asker(): void
    {
        $creator = $this->creator();
        $post = $this->qa($creator, '+1 hour');
        $fan = $this->fan();
        $this->actingAs($fan)->postJson("/posts/{$post->id}/qa/rsvp", ['on' => true]);
        $this->postJson("/posts/{$post->id}/qa/questions", ['body' => 'Favourite brush?']);

        $this->artisan('qa:start'); // not yet
        $this->assertSame(0, DB::table('notifications')->where('type', 'qa_live')->count());

        $this->travel(61)->minutes();
        $this->artisan('qa:start');
        $this->artisan('qa:start'); // only once
        $this->assertSame(1, DB::table('notifications')->where('type', 'qa_live')->where('notifiable_id', $fan->id)->count());

        $question = QaQuestion::firstOrFail();
        $this->actingAs($creator->user)->postJson("/qa-questions/{$question->id}/answer", ['answer' => 'The flat one'])
            ->assertOk()->assertJsonPath('qa.state', 'live')->assertJsonPath('qa.list.0.answer', 'The flat one');
        $this->assertSame(1, DB::table('notifications')->where('type', 'qa_answered')->where('notifiable_id', $fan->id)->count());
    }

    public function test_hidden_questions_disappear_for_fans_and_ended_qas_take_no_more(): void
    {
        $creator = $this->creator();
        $post = $this->qa($creator, '-30 minutes', 60);
        $fan = $this->fan();
        $this->actingAs($fan)->postJson("/posts/{$post->id}/qa/questions", ['body' => 'Something rude']);
        $question = QaQuestion::firstOrFail();

        $this->actingAs($creator->user)->postJson("/qa-questions/{$question->id}/hide", ['hidden' => true])->assertJsonPath('qa.list.0.hidden', true);
        $this->actingAs($fan)->getJson("/posts/{$post->id}/qa")->assertJsonCount(0, 'qa.list');
        $this->getJson("/posts/{$post->id}")->assertNotFound(); // (no such page; just making sure nothing leaks elsewhere)

        $this->travel(31)->minutes();
        $this->postJson("/posts/{$post->id}/qa/questions", ['body' => 'Too late?'])->assertStatus(422);
        $this->getJson("/posts/{$post->id}/qa")->assertJsonPath('qa.state', 'ended')->assertJsonPath('qa.can_ask', false);
    }

    public function test_subscriber_only_qas_are_closed_to_others_and_cards_carry_the_summary(): void
    {
        $creator = $this->creator();
        $starts = now()->addHour();
        $post = $creator->posts()->create(['body' => 'Subs only', 'visibility' => Post::SUBSCRIBERS, 'qa_starts_at' => $starts, 'qa_ends_at' => $starts->copy()->addHour()]);
        $public = $this->qa($creator);

        $this->actingAs($this->fan())->getJson("/posts/{$post->id}/qa")->assertNotFound();
        $this->postJson("/posts/{$post->id}/qa/rsvp", ['on' => true])->assertNotFound();

        $this->get('/@artist')->assertInertia(fn ($p) => $p
            ->where('posts.0.id', $public->id)
            ->where('posts.0.qa.state', 'upcoming')
            ->where('posts.0.qa.rsvps', 0)
            ->where('posts.1.qa', null)); // locked: nothing about it
    }
}
