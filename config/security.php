<?php

return [
    // Admins must turn on authenticator-app codes before they can open the admin area.
    'admin_requires_two_factor' => (bool) env('ADMIN_REQUIRE_2FA', true),
];
