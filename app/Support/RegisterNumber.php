<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * Mongolian civil register number (регистрийн дугаар): two Cyrillic letters + 8 digits, e.g. УБ99031512.
 * Digits 1–6 are the birth date as YYMMDD; people born in 2000 or later have 20 added to the month
 * (УБ05230112 → 2005-03-01). The last two digits are a serial and a check digit.
 */
final class RegisterNumber
{
    public static function normalize(string $input): string
    {
        return mb_strtoupper(preg_replace('/\s+/u', '', $input) ?? '');
    }

    public static function isValidFormat(string $register): bool
    {
        return (bool) preg_match('/^[А-ЯЁӨҮ]{2}\d{8}$/u', self::normalize($register));
    }

    /** Birth date encoded in the number, or null if it isn't a real date. */
    public static function birthdate(string $register): ?CarbonImmutable
    {
        $register = self::normalize($register);
        if (! self::isValidFormat($register)) {
            return null;
        }

        $digits = mb_substr($register, 2);
        $yy = (int) substr($digits, 0, 2);
        $mm = (int) substr($digits, 2, 2);
        $dd = (int) substr($digits, 4, 2);

        [$year, $month] = $mm > 20 ? [2000 + $yy, $mm - 20] : [1900 + $yy, $mm];

        if (! checkdate($month, $dd, $year)) {
            return null;
        }

        return CarbonImmutable::create($year, $month, $dd)->startOfDay();
    }

    /** Keyed fingerprint so the same person can't register twice, without storing the number in plain text. */
    public static function fingerprint(string $register): string
    {
        return hash_hmac('sha256', self::normalize($register), (string) config('app.key'));
    }
}
