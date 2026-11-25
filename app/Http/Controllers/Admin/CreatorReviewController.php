<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CreatorProfile;
use App\Support\RegisterNumber;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Admins check each creator's identity and consent before their page goes live. */
class CreatorReviewController extends Controller
{
    public function index(): Response
    {
        $map = fn (CreatorProfile $p) => [
            'id' => $p->id,
            ...$p->only('handle', 'display_name', 'bio', 'price_monthly', 'adult_content', 'status', 'review_note', 'legal_name', 'bank_name', 'account_holder'),
            'register_number' => $p->register_number,
            'born' => RegisterNumber::birthdate($p->register_number)?->toDateString(),
            'bank_account' => $p->bank_account,
            'consented_at' => $p->consented_at->toIso8601String(),
            'submitted_at' => $p->updated_at->toIso8601String(),
            'user' => [
                'id' => $p->user->id, 'name' => $p->user->name, 'phone' => $p->user->phone,
                'birthdate' => $p->user->birthdate?->toDateString(), 'joined' => $p->user->created_at->toIso8601String(),
            ],
            // The same payout account on another creator is a red flag.
            'shared_account' => CreatorProfile::where('bank_account_hash', $p->bank_account_hash)->where('id', '!=', $p->id)->pluck('handle'),
        ];

        return Inertia::render('admin/creators', [
            'pending' => CreatorProfile::with('user')->where('status', CreatorProfile::PENDING)->oldest('updated_at')->get()->map($map),
            'recent' => CreatorProfile::with('user')->where('status', '!=', CreatorProfile::PENDING)->latest('reviewed_at')->take(30)->get()->map($map),
        ]);
    }

    /** ID front / back / selfie, streamed from private storage to admins only. */
    public function document(CreatorProfile $creator, string $kind): StreamedResponse
    {
        $path = match ($kind) {
            'front' => $creator->id_front_path,
            'back' => $creator->id_back_path,
            'selfie' => $creator->selfie_path,
            default => abort(404),
        };
        abort_unless(Storage::exists($path), 404);

        return Storage::response($path, headers: ['Cache-Control' => 'private, no-store']);
    }

    public function decide(Request $request, CreatorProfile $creator): RedirectResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:approved,rejected'],
            'note' => ['required_if:decision,rejected', 'nullable', 'string', 'max:500'],
        ]);

        $creator->update([
            'status' => $data['decision'],
            'review_note' => $data['note'] ?? null,
            'reviewed_at' => now(),
            'reviewed_by' => $request->user()->id,
        ]);

        return back();
    }
}
