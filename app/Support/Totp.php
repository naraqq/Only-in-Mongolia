<?php

namespace App\Support;

/**
 * Time-based one-time passwords (RFC 6238), as used by Google Authenticator, Authy, 1Password and the like:
 * 6 digits, 30-second steps, SHA-1. The secret is shared once through a QR code (otpauth:// URL).
 */
class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** A new random secret, base32 (160 bits). */
    public static function secret(): string
    {
        $bytes = random_bytes(20);
        $bits = '';
        foreach (str_split($bytes) as $b) {
            $bits .= str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT);
        }

        return implode('', array_map(fn ($chunk) => self::ALPHABET[bindec(str_pad($chunk, 5, '0'))], str_split($bits, 5)));
    }

    /** The 6-digit code for a moment (now by default). */
    public static function code(string $secret, ?int $at = null): string
    {
        $counter = intdiv($at ?? time(), 30);
        $hash = hash_hmac('sha1', pack('N*', 0, $counter), self::decode($secret), true);
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24) | (ord($hash[$offset + 1]) << 16) | (ord($hash[$offset + 2]) << 8) | ord($hash[$offset + 3]);

        return str_pad((string) ($value % 1_000_000), 6, '0', STR_PAD_LEFT);
    }

    /** Is $code right for now, allowing one step either side for clock drift? */
    public static function verify(string $secret, string $code): bool
    {
        $code = preg_replace('/\D/', '', $code);
        if (strlen($code) !== 6) {
            return false;
        }
        foreach ([-1, 0, 1] as $step) {
            if (hash_equals(self::code($secret, time() + $step * 30), $code)) {
                return true;
            }
        }

        return false;
    }

    /** What the authenticator app scans. */
    public static function url(string $issuer, string $account, string $secret): string
    {
        return 'otpauth://totp/'.rawurlencode("{$issuer}:{$account}").'?'.http_build_query(['secret' => $secret, 'issuer' => $issuer, 'digits' => 6, 'period' => 30]);
    }

    private static function decode(string $secret): string
    {
        $bits = '';
        foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $secret))) as $c) {
            $bits .= str_pad(decbin(strpos(self::ALPHABET, $c)), 5, '0', STR_PAD_LEFT);
        }

        return implode('', array_map(fn ($byte) => chr(bindec($byte)), array_filter(str_split($bits, 8), fn ($b) => strlen($b) === 8)));
    }
}
