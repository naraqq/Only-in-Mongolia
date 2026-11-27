<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A subscription payment that extended access the fan already had (a renewal), as opposed to a new subscriber.
        Schema::table('payments', function (Blueprint $table) {
            $table->boolean('renewal')->default(false);
        });

        // Work it out for past payments: replay each fan's paid subscriptions to each creator in order.
        $days = (int) config('creators.subscription_days', 30);
        $paid = DB::table('payments')->where('purpose', 'subscription')->whereIn('status', ['paid', 'refunded'])->whereNotNull('paid_at')
            ->orderBy('user_id')->orderBy('creator_profile_id')->orderBy('paid_at')->get(['id', 'user_id', 'creator_profile_id', 'paid_at', 'months']);
        $until = [];
        $renewals = [];
        foreach ($paid as $p) {
            $key = $p->user_id.':'.$p->creator_profile_id;
            $at = Carbon::parse($p->paid_at);
            $active = isset($until[$key]) && $until[$key]->gt($at);
            if ($active) {
                $renewals[] = $p->id;
            }
            $until[$key] = ($active ? $until[$key] : $at)->copy()->addDays($days * max(1, (int) $p->months));
        }
        foreach (array_chunk($renewals, 500) as $ids) {
            DB::table('payments')->whereIn('id', $ids)->update(['renewal' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn('renewal');
        });
    }
};
