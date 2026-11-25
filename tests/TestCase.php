<?php

namespace Tests;

use App\Http\Middleware\EnsureAgeConfirmed;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /** Most tests act as a visitor who already passed the 18+ gate. Age-gate tests turn this off. */
    protected bool $ageConfirmed = true;

    protected function setUp(): void
    {
        parent::setUp();

        if ($this->ageConfirmed) {
            // withCredentials: JSON test requests (e.g. the login status poll) only send cookies when asked to.
            $this->withCookie(EnsureAgeConfirmed::COOKIE, '1')->withCredentials();
        }
    }
}
