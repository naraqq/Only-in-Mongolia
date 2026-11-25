<?php

namespace Tests\Unit;

use App\Support\RegisterNumber;
use PHPUnit\Framework\TestCase;

class RegisterNumberTest extends TestCase
{
    public function test_reads_the_birth_date_including_people_born_after_2000(): void
    {
        $this->assertSame('1999-03-15', RegisterNumber::birthdate('УБ99031512')?->toDateString());
        $this->assertSame('2005-03-01', RegisterNumber::birthdate('уб 05230112')?->toDateString()); // month + 20 → 2000s
        $this->assertSame('1987-12-31', RegisterNumber::birthdate('ӨҮ87123199')?->toDateString()); // Mongolian letters
    }

    public function test_rejects_bad_numbers(): void
    {
        $this->assertNull(RegisterNumber::birthdate('AB99031512'));  // Latin letters
        $this->assertNull(RegisterNumber::birthdate('УБ9903151'));   // too short
        $this->assertNull(RegisterNumber::birthdate('УБ99133112'));  // month 13
        $this->assertNull(RegisterNumber::birthdate('УБ99023012'));  // 30 February
    }
}
