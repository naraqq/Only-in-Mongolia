<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_visitors_land_on_phone_login_and_public_pages_have_no_age_wall(): void
    {
        $this->get('/')->assertRedirect('/login');
        $this->get('/creators')->assertOk();
        $this->get('/login')->assertOk();
        $this->get('/age-gate')->assertNotFound();
    }
}
