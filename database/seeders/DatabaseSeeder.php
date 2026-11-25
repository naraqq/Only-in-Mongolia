<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database. Locally that's demo creators and posts (see DemoSeeder).
     */
    public function run(): void
    {
        if (! app()->isProduction()) {
            $this->call(DemoSeeder::class);
        }
    }
}
