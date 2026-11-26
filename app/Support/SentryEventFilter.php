<?php

namespace App\Support;

use Sentry\Event;

final class SentryEventFilter
{
    public static function filter(Event $event): ?Event
    {
        $exceptions = $event->getExceptions();
        if ($exceptions === []) {
            return null;
        }

        // Exception messages can contain SQL values, provider responses, or user input.
        // Rebuild the event with only the information needed to locate the error.
        foreach ($exceptions as $exception) {
            $exception->setValue('Exception details omitted for privacy')->setMechanism(null);
            foreach ($exception->getStacktrace()?->getFrames() ?? [] as $frame) {
                $frame->setVars([])->setPreContext([])->setContextLine(null)->setPostContext([]);
            }
        }

        return Event::createEvent($event->getId())
            ->setTimestamp($event->getTimestamp())
            ->setLevel($event->getLevel())
            ->setRelease($event->getRelease())
            ->setEnvironment($event->getEnvironment())
            ->setExceptions($exceptions);
    }
}
