<?php

namespace App\Http\Controllers;

use App\Support\Images;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/** "My profile" with its edit form: everyone has a name, photo and cover; approved creators also a bio, price and message settings. */
class ProfileEditController extends Controller
{
    public const DM_POLICIES = ['everyone', 'followers', 'subscribers'];

    public function edit(Request $request): Response
    {
        $user = $request->user();
        $creator = $user->creatorProfile()->where('status', 'approved')->first();
        // Opened from the studio: creators only, always the form, in the studio layout.
        $studio = $request->routeIs('studio.*');
        abort_if($studio && ! $creator, 404);

        return Inertia::render('profile/edit', [
            'area' => $studio ? 'studio' : 'social',
            // The page shows the profile; ?edit opens the form straight away (e.g. from the creator page's edit button).
            'editing' => $studio || $request->boolean('edit'),
            'profile' => [
                'name' => $user->name,
                'avatar_url' => $user->avatar_url,
                'cover_url' => $user->cover_path ? Storage::disk('public')->url($user->cover_path) : null,
                'joined' => $user->created_at->toIso8601String(),
            ],
            'stats' => [
                'following' => $user->following()->count(),
                'subscriptions' => $user->subscriptions()->active()->count(),
                'saved' => $user->bookmarks()->count(),
            ],
            'creator' => $creator ? [
                ...$creator->only('handle', 'display_name', 'bio', 'price_monthly', 'dm_policy'),
                'bundles' => collect(config('creators.bundle_months'))->mapWithKeys(fn ($m) => [$m => (int) ($creator->bundles[(string) $m] ?? 0)]),
                'cover_url' => $creator->coverUrl(),
            ] : null,
            'limits' => ['min_price' => config('creators.min_price'), 'max_price' => config('creators.max_price'), 'max_discount' => config('creators.max_bundle_discount')],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $user = $request->user();
        $creator = $user->creatorProfile()->where('status', 'approved')->first();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            ...($creator ? [
                'display_name' => ['required', 'string', 'max:60'],
                'bio' => ['nullable', 'string', 'max:500'],
                'price_monthly' => ['required', 'integer', 'min:'.config('creators.min_price'), 'max:'.config('creators.max_price')],
                'dm_policy' => ['required', Rule::in(self::DM_POLICIES)],
                'bundles' => ['nullable', 'array'],
                ...collect(config('creators.bundle_months'))->mapWithKeys(fn ($m) => [
                    "bundles.{$m}" => ['nullable', 'integer', 'min:0', 'max:'.config('creators.max_bundle_discount')],
                ])->all(),
            ] : []),
        ]);

        $user->update(['name' => trim($data['name'])]);
        // A new price applies to new payments; current subscribers keep what they paid for.
        $creator?->update([
            'display_name' => trim($data['display_name']),
            'bio' => trim((string) ($data['bio'] ?? '')) ?: null,
            'price_monthly' => $data['price_monthly'],
            'dm_policy' => $data['dm_policy'],
            'bundles' => collect(config('creators.bundle_months'))
                ->mapWithKeys(fn ($m) => [(string) $m => (int) ($data['bundles'][$m] ?? $data['bundles'][(string) $m] ?? 0)])
                ->filter()->all() ?: null,
        ]);

        return back()->with('status', 'saved');
    }

    /** Upload a profile photo (square) or cover (3:1). Old file is deleted. */
    public function photo(Request $request, string $kind): RedirectResponse
    {
        $request->validate(['photo' => ['required', 'file', 'mimetypes:image/jpeg,image/png,image/webp', 'max:10240']]);
        [$model, $column, $w, $h] = $this->target($request, $kind);

        try {
            $path = Images::storeCropped($request->file('photo'), $kind === 'avatar' ? 'avatars' : 'covers', $w, $h);
        } catch (RuntimeException) {
            return back()->withErrors(['photo' => __('This image could not be read. Try a JPG or PNG.')]);
        }

        $old = $model->{$column};
        $model->forceFill([$column => $path])->save();
        if ($old) {
            Storage::disk('public')->delete($old);
        }

        return back();
    }

    public function removePhoto(Request $request, string $kind): RedirectResponse
    {
        [$model, $column] = $this->target($request, $kind);
        if ($model->{$column}) {
            Storage::disk('public')->delete($model->{$column});
            $model->forceFill([$column => null])->save();
        }

        return back();
    }

    /** @return array{0: \Illuminate\Database\Eloquent\Model, 1: string, 2: int, 3: int} */
    private function target(Request $request, string $kind): array
    {
        if ($kind === 'avatar') {
            return [$request->user(), 'avatar_path', 400, 400];
        }
        // Creators' cover shows on their page; everyone else's is kept on the account.
        $creator = $request->user()->creatorProfile()->where('status', 'approved')->first();

        return [$creator ?? $request->user(), 'cover_path', 1500, 500];
    }
}
