{{--
    The plain branded error page, for when the app itself can't draw one (e.g. maintenance mode, or an error while
    rendering). Laravel's built-in error views (404, 500, 503…) all extend errors::minimal, so this restyles them all.
    The usual error pages are resources/js/pages/error.tsx.
--}}
@php($mn = ! str_starts_with((string) request()->getPreferredLanguage(['mn', 'en']), 'en'))
<!DOCTYPE html>
<html lang="{{ $mn ? 'mn' : 'en' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('code') · {{ config('app.name') }}</title>
    <style>
        :root { --bg: #f6f5ef; --fg: #20251e; --muted: #5d6459; --accent: #d4f47c; --primary: #345137; --on-primary: #fff; }
        @media (prefers-color-scheme: dark) { :root { --bg: #181c17; --fg: #f1f3ec; --muted: #a3ab9c; --primary: #c3e583; --on-primary: #20251e; } }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; padding: 24px;
            background: radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 55%), var(--bg);
            color: var(--fg); font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: center; }
        .brand { position: fixed; top: 18px; left: 24px; display: flex; align-items: center; gap: 10px; font-weight: 800; color: inherit; text-decoration: none; }
        .code { margin-top: 28px; color: var(--primary); font-weight: 800; letter-spacing: .25em; font-size: 14px; }
        h1 { margin: 8px 0 0; font-size: clamp(26px, 5vw, 36px); letter-spacing: -.02em; }
        p { margin: 12px auto 0; max-width: 28rem; color: var(--muted); line-height: 1.5; }
        .actions { margin-top: 28px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .btn { display: inline-flex; align-items: center; height: 44px; padding: 0 20px; border-radius: 12px; font-weight: 700; font-size: 14px; text-decoration: none; border: 0; cursor: pointer; }
        .primary { background: var(--primary); color: var(--on-primary); }
        .ghost { background: transparent; color: var(--fg); }
        .ghost:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
    </style>
</head>
<body>
    <a class="brand" href="/">
        <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#d4f47c"/><circle cx="20" cy="15" r="5" fill="#20251e"/><path d="M7 29 16 21l5 4 6-5 6 9H7Z" fill="#20251e"/></svg>
        {{ config('app.name') }}
    </a>
    <svg width="280" viewBox="0 0 240 150" aria-hidden="true">
        <rect width="240" height="150" rx="28" fill="#d4f47c"/>
        <circle cx="120" cy="66" r="22" fill="#20251e"/>
        <path d="M0 150V112l44-34 34 26 42-36 40 32 30-22 50 40v32Z" fill="#20251e" clip-path="inset(0 round 28px)"/>
    </svg>
    <div class="code">{{ $mn ? 'АЛДАА' : 'ERROR' }} @yield('code')</div>
    @php($code = (int) trim($__env->yieldContent('code')))
    <h1>
        @switch($code)
            @case(404) {{ $mn ? 'Энэ хуудас тал нутагт төөрчихжээ' : 'This page wandered off into the steppe' }} @break
            @case(403) {{ $mn ? 'Энэ хуудас танд нээлттэй биш' : 'This isn’t open to you' }} @break
            @case(419) {{ $mn ? 'Хуудасны хугацаа дууссан' : 'This page has expired' }} @break
            @case(429) {{ $mn ? 'Жаахан удаашруулъя' : 'Easy, not so fast' }} @break
            @case(503) {{ $mn ? 'Түр засвар хийж байна' : 'We’re doing a quick tune-up' }} @break
            @default {{ $mn ? 'Манай талд алдаа гарлаа' : 'Something broke on our side' }}
        @endswitch
    </h1>
    <p>
        @switch($code)
            @case(404) {{ $mn ? 'Таны хайсан зүйл олдсонгүй. Холбоос хуучирсан эсвэл хуудас устсан байж магадгүй.' : 'We couldn’t find what you were looking for.' }} @break
            @case(503) {{ $mn ? 'Сайт шинэчлэгдэж байна, удахгүй эргэн ажиллана.' : 'The site is being updated and will be back shortly.' }} @break
            @default {{ $mn ? 'Хуудсыг шинэчлээд дахин оролдоно уу.' : 'Please refresh the page and try again.' }}
        @endswitch
    </p>
    <div class="actions">
        <a class="btn primary" href="/">{{ $mn ? 'Нүүр хуудас' : 'Go home' }}</a>
        <button class="btn ghost" onclick="location.reload()">{{ $mn ? 'Шинэчлэх' : 'Refresh' }}</button>
    </div>
</body>
</html>
