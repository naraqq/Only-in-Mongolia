<?php

namespace App\Payments;

use App\Models\Payment;
use App\Models\User;
use App\Models\WalletEntry;
use Illuminate\Support\Facades\DB;

/**
 * A fan's stored balance. Every change locks the user's row, writes a ledger entry with the balance after it,
 * and updates the cached balance in the same transaction, so two payments at once can't spend the same money.
 */
class Wallet
{
    public static function balance(User $user): int
    {
        return (int) User::whereKey($user->id)->value('wallet_balance');
    }

    public static function credit(User $user, int $amount, string $type, ?Payment $payment = null, ?string $note = null): WalletEntry
    {
        return self::move($user, $amount, $type, $payment, $note);
    }

    /** @throws InsufficientBalance */
    public static function debit(User $user, int $amount, string $type, ?Payment $payment = null, ?string $note = null): WalletEntry
    {
        return self::move($user, -$amount, $type, $payment, $note);
    }

    private static function move(User $user, int $delta, string $type, ?Payment $payment, ?string $note): WalletEntry
    {
        abort_if($delta === 0, 422);

        return DB::transaction(function () use ($user, $delta, $type, $payment, $note) {
            $locked = User::whereKey($user->id)->lockForUpdate()->first(['id', 'wallet_balance']);
            $after = (int) $locked->wallet_balance + $delta;
            if ($after < 0) {
                throw new InsufficientBalance((int) $locked->wallet_balance, -$delta);
            }
            User::whereKey($user->id)->update(['wallet_balance' => $after]);
            $user->wallet_balance = $after;

            return WalletEntry::create([
                'user_id' => $user->id, 'type' => $type, 'amount' => $delta, 'balance_after' => $after,
                'payment_id' => $payment?->id, 'note' => $note,
            ]);
        });
    }
}
