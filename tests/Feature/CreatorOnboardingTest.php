<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\PhoneVerification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CreatorOnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
    }

    private function adult(string $birthdate = '1999-03-15'): User
    {
        return User::factory()->create(['birthdate' => $birthdate, 'phone' => (string) random_int(80000000, 99999999)]);
    }

    private function admin(): User
    {
        $u = User::factory()->create();
        $u->forceFill(['is_admin' => true])->save();

        return $u;
    }

    private function application(array $overrides = []): array
    {
        return [
            'handle' => '@Saraa.Art', 'display_name' => 'Saraa', 'bio' => 'Drawings and behind the scenes',
            'price_monthly' => '15,000', 'adult_content' => true,
            'legal_name' => 'Батын Сараа', 'register_number' => 'уб 99031512',
            'id_front' => UploadedFile::fake()->image('front.jpg'),
            'id_back' => UploadedFile::fake()->image('back.jpg'),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
            'bank_name' => 'Хаан банк', 'bank_account' => '5000 123 456', 'account_holder' => 'Батын Сараа',
            'consent_age' => true, 'consent_people' => true, 'consent_legal' => true,
            ...$overrides,
        ];
    }

    public function test_signup_requires_an_adult_date_of_birth(): void
    {
        config(['services.verify_mn.dev_phones' => ['80105376']]);
        $this->post('/login/phone', ['phone' => '80105376']);
        $this->post('/login/phone/complete');

        $this->post('/login/phone/name', ['name' => 'Kid', 'birthdate' => now()->subYears(17)->toDateString()])->assertSessionHasErrors('birthdate');
        $this->post('/login/phone/name', ['name' => 'Kid'])->assertSessionHasErrors('birthdate');
        $this->assertGuest();

        $this->post('/login/phone/name', ['name' => 'Adult', 'birthdate' => now()->subYears(18)->toDateString()])->assertRedirect('/dashboard');
        $this->assertSame(now()->subYears(18)->toDateString(), User::sole()->birthdate->toDateString());
    }

    public function test_adult_can_apply_and_private_details_are_protected(): void
    {
        $user = $this->adult();

        $this->actingAs($user)->post('/creator/apply', $this->application())->assertSessionHasNoErrors()->assertRedirect('/creator/apply');

        $p = CreatorProfile::sole();
        $this->assertSame(['saraa.art', 15000, CreatorProfile::PENDING, true], [$p->handle, $p->price_monthly, $p->status, $p->adult_content]);
        $this->assertSame('УБ99031512', $p->register_number);
        $this->assertSame('5000123456', $p->bank_account);
        Storage::assertExists([$p->id_front_path, $p->id_back_path, $p->selfie_path]);

        // Encrypted at rest.
        $raw = DB::table('creator_profiles')->first();
        $this->assertStringNotContainsString('99031512', $raw->register_number);
        $this->assertStringNotContainsString('5000123456', $raw->bank_account);

        // The applicant's own view never includes documents or numbers.
        $this->actingAs($user)->get('/creator/apply')->assertInertia(fn ($page) => $page
            ->where('application.status', 'pending')
            ->missing('application.register_number')
            ->missing('application.bank_account')
            ->missing('application.id_front_path'));
    }

    public function test_register_number_must_be_valid_adult_matching_and_unique(): void
    {
        $user = $this->adult();

        $this->actingAs($user)->post('/creator/apply', $this->application(['register_number' => 'AB12345678']))->assertSessionHasErrors('register_number');
        // A different birth date than the account's.
        $this->actingAs($user)->post('/creator/apply', $this->application(['register_number' => 'УБ98031512']))->assertSessionHasErrors('register_number');
        // Under 18 (and also not matching): rejected.
        $this->actingAs($user)->post('/creator/apply', $this->application(['register_number' => 'УБ'.now()->subYears(10)->format('y').str_pad((string) (now()->month + 20), 2, '0', STR_PAD_LEFT).now()->format('d').'12']))->assertSessionHasErrors('register_number');
        $this->assertSame(0, CreatorProfile::count());

        // Same person can't open a second creator account from another phone.
        $this->actingAs($user)->post('/creator/apply', $this->application());
        $this->actingAs($this->adult())->post('/creator/apply', $this->application(['handle' => 'other']))->assertSessionHasErrors('register_number');
        $this->assertSame(1, CreatorProfile::count());
    }

    public function test_every_consent_and_document_is_required(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // many attempts in a row
        $user = $this->adult();
        foreach (['consent_age', 'consent_people', 'consent_legal', 'id_front', 'id_back', 'selfie'] as $field) {
            $this->actingAs($user)->post('/creator/apply', $this->application([$field => null]))->assertSessionHasErrors($field);
        }
        $this->actingAs($user)->post('/creator/apply', $this->application(['handle' => 'admin']))->assertSessionHasErrors('handle');
        $this->actingAs($user)->post('/creator/apply', $this->application(['price_monthly' => '100']))->assertSessionHasErrors('price_monthly');
        $this->assertSame(0, CreatorProfile::count());
    }

    public function test_only_admins_review_and_see_documents(): void
    {
        $applicant = $this->adult();
        $this->actingAs($applicant)->post('/creator/apply', $this->application());
        $p = CreatorProfile::sole();

        $this->actingAs($applicant)->get('/admin/creators')->assertForbidden();
        $this->actingAs($applicant)->get("/admin/creators/{$p->id}/document/front")->assertForbidden();

        $admin = $this->admin();
        $this->actingAs($admin)->get('/admin/creators')->assertInertia(fn ($page) => $page
            ->has('pending', 1)
            ->where('pending.0.register_number', 'УБ99031512')
            ->where('pending.0.born', '1999-03-15'));
        $this->actingAs($admin)->get("/admin/creators/{$p->id}/document/selfie")->assertOk();

        // Rejecting needs a reason; the applicant sees it and can apply again.
        $this->actingAs($admin)->post("/admin/creators/{$p->id}/decide", ['decision' => 'rejected'])->assertSessionHasErrors('note');
        $this->actingAs($admin)->post("/admin/creators/{$p->id}/decide", ['decision' => 'rejected', 'note' => 'Selfie is blurry']);
        $this->actingAs($applicant)->get('/creator/apply')->assertInertia(fn ($page) => $page
            ->where('application.status', 'rejected')->where('application.review_note', 'Selfie is blurry'));

        $this->actingAs($applicant)->post('/creator/apply', $this->application())->assertSessionHasNoErrors();
        $this->assertSame('pending', $p->fresh()->status);

        $this->actingAs($admin)->post("/admin/creators/{$p->id}/decide", ['decision' => 'approved']);
        $this->assertTrue($p->fresh()->isApproved());
        $this->assertSame($admin->id, $p->fresh()->reviewed_by);
    }

    public function test_make_admin_command(): void
    {
        $user = User::factory()->create(['phone' => '99112233']);

        $this->artisan('user:make-admin', ['phone' => '9911-2233'])->assertSuccessful();
        $this->assertTrue($user->fresh()->is_admin);
        $this->artisan('user:make-admin', ['phone' => '88001122'])->assertFailed();
    }
}
