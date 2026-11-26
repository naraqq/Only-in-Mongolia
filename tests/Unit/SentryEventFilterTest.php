<?php

namespace Tests\Unit;

use App\Support\SentryEventFilter;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Sentry\Event;
use Sentry\ExceptionDataBag;
use Sentry\Frame;
use Sentry\Stacktrace;

class SentryEventFilterTest extends TestCase
{
    public function test_error_events_keep_release_and_stack_locations_without_private_data(): void
    {
        $frame = new Frame('checkout', 'app/Payments/Payments.php', 42, vars: ['phone' => 'private']);
        $frame->setContextLine('private');
        $event = Event::createEvent()
            ->setRelease('release-123')
            ->setMessage('private')
            ->setRequest(['data' => 'private'])
            ->setExtra(['payload' => 'private'])
            ->setTag('account', 'private')
            ->setContext('checkout', ['reference' => 'private'])
            ->setExceptions([new ExceptionDataBag(new RuntimeException('private'), new Stacktrace([$frame]))]);

        $filtered = SentryEventFilter::filter($event);

        self::assertNotNull($filtered);
        self::assertSame('release-123', $filtered->getRelease());
        self::assertNull($filtered->getMessage());
        self::assertSame([], $filtered->getRequest());
        self::assertSame([], $filtered->getExtra());
        self::assertSame([], $filtered->getTags());
        self::assertSame([], $filtered->getContexts());
        $exception = $filtered->getExceptions()[0];
        self::assertSame(RuntimeException::class, $exception->getType());
        self::assertSame('Exception details omitted for privacy', $exception->getValue());
        $filteredFrame = $exception->getStacktrace()->getFrame(0);
        self::assertSame('app/Payments/Payments.php', $filteredFrame->getFile());
        self::assertSame(42, $filteredFrame->getLine());
        self::assertSame([], $filteredFrame->getVars());
        self::assertNull($filteredFrame->getContextLine());
    }

    public function test_message_only_events_are_dropped(): void
    {
        self::assertNull(SentryEventFilter::filter(Event::createEvent()->setMessage('private')));
    }
}
