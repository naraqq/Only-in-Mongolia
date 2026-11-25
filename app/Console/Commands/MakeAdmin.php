<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\VerifyMn;
use Illuminate\Console\Command;

/** php artisan user:make-admin 99112233 — give an existing account (found by phone) admin rights. */
class MakeAdmin extends Command
{
    protected $signature = 'user:make-admin {phone : 8-digit mobile number of an existing account}';

    protected $description = 'Give an existing account admin rights';

    public function handle(): int
    {
        $phone = VerifyMn::normalizePhone((string) $this->argument('phone'));
        $user = $phone ? User::where('phone', $phone)->first() : null;

        if (! $user) {
            $this->error('No account with that phone number. Log in with it once first.');

            return self::FAILURE;
        }

        $user->forceFill(['is_admin' => true])->save();
        $this->info("{$user->name} (****".substr($phone, -4).') is now an admin.');

        return self::SUCCESS;
    }
}
