<?php

namespace App\Push;

/**
 * Push notification wording, in the reader's language. The bell page writes its own text in the browser
 * (resources/js/lib/i18n.ts, keys nt.*); a push is shown by the phone before the app opens, so the server writes it.
 * Keep the two in step.
 */
class Texts
{
    private const TEXT = [
        'en' => [
            'followed' => '{name} started following you',
            'subscribed' => '{name} subscribed to you ({amount})',
            'renewed' => '{name} renewed their subscription ({amount})',
            'tipped' => '{name} tipped you {amount}',
            'purchased' => '{name} unlocked your paid content ({amount})',
            'new_post' => '{name} posted something new',
            'commented' => '{name} commented on your post',
            'replied' => '{name} replied to your comment',
            'expiring' => 'Your subscription to {name} ends on {date}. Renew to keep access.',
            'auto_renewed' => 'Your subscription to {name} renewed from your wallet ({amount}).',
            'renew_failed' => 'Couldn’t renew {name}: your wallet needs {amount}. Top up before it ends.',
            'trial_started' => '{name} started a free trial',
            'payout_paid' => 'Your payout of {amount} was sent to your bank account',
            'payout_rejected' => 'Your payout request of {amount} was rejected',
            'refunded' => 'Your payment of {amount} to {name} was refunded',
            'charge_refunded' => 'A payment of {amount} from {name} was refunded',
            'message' => 'New message',
            'media' => 'Sent a photo or video',
        ],
        'mn' => [
            'followed' => '{name} таныг дагаж эхэллээ',
            'subscribed' => '{name} танд subscribe хийлээ ({amount})',
            'renewed' => '{name} subscription-оо сунгалаа ({amount})',
            'tipped' => '{name} танд {amount} tip илгээлээ',
            'purchased' => '{name} таны төлбөртэй контентыг нээлээ ({amount})',
            'new_post' => '{name} шинэ нийтлэл орууллаа',
            'commented' => '{name} таны нийтлэлд сэтгэгдэл үлдээлээ',
            'replied' => '{name} таны сэтгэгдэлд хариуллаа',
            'expiring' => '{name}-ийн subscription {date}-нд дуусна. Үргэлжлүүлэхийн тулд сунгаарай.',
            'auto_renewed' => '{name}-ийн subscription хэтэвчээс автоматаар сунгагдлаа ({amount}).',
            'renew_failed' => '{name}-ийн subscription-ийг сунгаж чадсангүй: хэтэвчинд {amount} хэрэгтэй. Дуусахаас өмнө цэнэглээрэй.',
            'trial_started' => '{name} үнэгүй туршилт эхлүүллээ',
            'payout_paid' => 'Таны {amount} татан авалт банкны данс руу шилжлээ',
            'payout_rejected' => 'Таны {amount} татан авах хүсэлтийг татгалзлаа',
            'refunded' => '{name}-д төлсөн {amount} буцаагдлаа',
            'charge_refunded' => '{name}-ийн төлсөн {amount} буцаагдлаа',
            'message' => 'Шинэ мессеж',
            'media' => 'Зураг эсвэл бичлэг илгээлээ',
        ],
    ];

    public static function line(string $key, ?string $locale, array $vars = []): ?string
    {
        $text = self::TEXT[self::locale($locale)][$key] ?? null;
        if ($text === null) {
            return null;
        }
        if (isset($vars['amount']) && is_numeric($vars['amount'])) {
            $vars['amount'] = '₮'.number_format((int) $vars['amount']);
        }
        if (isset($vars['date'])) {
            $vars['date'] = str_replace('-', '.', substr((string) $vars['date'], 0, 10));
        }

        return strtr($text, collect($vars)->mapWithKeys(fn ($v, $k) => ['{'.$k.'}' => (string) $v])->all());
    }

    public static function locale(?string $locale): string
    {
        return isset(self::TEXT[$locale]) ? $locale : 'mn';
    }

    /** @return list<string> */
    public static function keys(string $locale): array
    {
        return array_keys(self::TEXT[$locale]);
    }
}
