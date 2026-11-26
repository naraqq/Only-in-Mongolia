<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Support\RegisterNumber;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Become a creator": profile, identity (register number + ID photos + selfie), payout account and consent.
 * Everything goes to admin review; nothing is public until approved.
 */
class CreatorApplicationController extends Controller
{
    public function show(Request $request): Response
    {
        $profile = $request->user()->creatorProfile()->first(); // always the current state

        return Inertia::render('creator/apply', [
            // What the applicant may see of their own application (never the documents or full numbers).
            'application' => $profile ? [
                ...$profile->only('handle', 'display_name', 'bio', 'price_monthly', 'adult_content', 'status', 'review_note'),
                'reviewed_at' => $profile->reviewed_at?->toIso8601String(),
                'submitted_at' => $profile->updated_at->toIso8601String(),
            ] : null,
            'banks' => config('creators.banks'),
            'limits' => ['min' => config('creators.min_price'), 'max' => config('creators.max_price')],
            'keep' => 100 - (int) config('creators.platform_fee_percent'),
            'account_name' => $request->user()->name,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        $existing = $user->creatorProfile()->first();
        abort_if($existing && $existing->status !== CreatorProfile::REJECTED, 409, 'Application already submitted.');

        $request->merge([
            'handle' => mb_strtolower(ltrim(trim((string) $request->input('handle')), '@')),
            'register_number' => RegisterNumber::normalize((string) $request->input('register_number')),
            'bank_account' => preg_replace('/[\s-]/', '', (string) $request->input('bank_account')),
            'price_monthly' => (int) preg_replace('/\D/', '', (string) $request->input('price_monthly')),
        ]);

        $image = ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'];
        $data = $request->validate([
            'handle' => [
                'required', 'string', 'min:3', 'max:30', 'regex:/^[a-z0-9_.]+$/',
                Rule::notIn(config('creators.reserved_handles')),
                Rule::unique('creator_profiles', 'handle')->ignore($existing?->id),
            ],
            'display_name' => ['required', 'string', 'max:60'],
            'bio' => ['nullable', 'string', 'max:500'],
            'price_monthly' => ['required', 'integer', 'min:'.config('creators.min_price'), 'max:'.config('creators.max_price')],
            'adult_content' => ['boolean'],
            'legal_name' => ['required', 'string', 'max:100'],
            'register_number' => ['required', 'string'],
            'id_front' => $image,
            'id_back' => $image,
            'selfie' => $image,
            'bank_name' => ['required', Rule::in(config('creators.banks'))],
            'bank_account' => ['required', 'regex:/^(MN\d{18}|\d{6,20})$/i'],
            'account_holder' => ['required', 'string', 'max:80'],
            // Every consent box must be ticked.
            'consent_age' => ['accepted'],
            'consent_people' => ['accepted'],
            'consent_legal' => ['accepted'],
        ], [
            'handle.regex' => __('Use only lowercase letters, numbers, dots and underscores.'),
            'handle.not_in' => __('This handle is reserved.'),
            'bank_account.regex' => __('Enter a valid account number (digits only, or an MN IBAN).'),
        ]);

        // The register number must be real, belong to an adult, match the date of birth given at sign-up,
        // and not already be used by another creator.
        $born = RegisterNumber::birthdate($data['register_number']);
        if (! $born) {
            return back()->withErrors(['register_number' => __('Enter a valid register number, e.g. УБ99031512.')]);
        }
        if ($born->age < config('creators.min_age')) {
            return back()->withErrors(['register_number' => __('Creators must be at least 18 years old.')]);
        }
        if ($user->birthdate && ! $born->isSameDay($user->birthdate)) {
            return back()->withErrors(['register_number' => __('This register number doesn’t match the date of birth on your account.')]);
        }
        $taken = CreatorProfile::where('register_hash', RegisterNumber::fingerprint($data['register_number']))
            ->where('user_id', '!=', $user->id)->exists();
        if ($taken) {
            return back()->withErrors(['register_number' => __('This register number is already used by another creator account.')]);
        }

        // ID documents go to the private disk; admins view them through a protected route.
        $dir = "creator-ids/{$user->id}";
        if ($existing) {
            Storage::delete([$existing->id_front_path, $existing->id_back_path, $existing->selfie_path]);
        }

        $user->creatorProfile()->updateOrCreate(['user_id' => $user->id], [
            ...collect($data)->only('handle', 'display_name', 'bio', 'price_monthly', 'legal_name', 'register_number', 'bank_name', 'bank_account', 'account_holder')->all(),
            'adult_content' => (bool) ($data['adult_content'] ?? false),
            'bank_account' => strtoupper($data['bank_account']),
            'id_front_path' => $request->file('id_front')->store($dir),
            'id_back_path' => $request->file('id_back')->store($dir),
            'selfie_path' => $request->file('selfie')->store($dir),
            'consented_at' => now(),
            'consent_ip' => $request->ip(),
            'status' => CreatorProfile::PENDING,
            'review_note' => null,
            'reviewed_at' => null,
            'reviewed_by' => null,
        ]);

        return to_route('creator.apply')->with('status', 'submitted');
    }
}
