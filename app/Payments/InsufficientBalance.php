<?php

namespace App\Payments;

use RuntimeException;

/** Paying from the wallet, or reversing a top-up, needs more than the balance holds. */
class InsufficientBalance extends RuntimeException
{
    public function __construct(public readonly int $balance, public readonly int $needed)
    {
        parent::__construct("Wallet has {$balance}, needs {$needed}.");
    }
}
