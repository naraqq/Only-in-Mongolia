@php
    /** @var \App\Models\Receipt $r */
    $mnt = fn (int $n) => number_format($n, 0, '.', ',').' ₮';
@endphp
<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="utf-8">
<title>{{ $r->number }}</title>
<style>
    @page { margin: 36px 40px; }
    * { font-family: 'DejaVu Sans', sans-serif; }
    body { font-size: 10.5px; color: #1f2328; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .muted { color: #6b7280; }
    .small { font-size: 9px; }
    table { width: 100%; border-collapse: collapse; }
    .head td { vertical-align: top; }
    .parties { margin-top: 22px; }
    .parties td { width: 50%; vertical-align: top; padding: 10px 12px; background: #f6f7f9; }
    .parties td + td { border-left: 8px solid #fff; }
    .label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; margin-bottom: 4px; }
    .lines { margin-top: 22px; }
    .lines th { text-align: left; font-size: 8.5px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #d0d4da; padding: 6px 4px; }
    .lines td { padding: 8px 4px; border-bottom: 1px solid #eceef1; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 10px; width: 46%; margin-left: 54%; }
    .totals td { padding: 4px; }
    .totals .grand td { font-size: 13px; font-weight: bold; border-top: 1.5px solid #1f2328; padding-top: 7px; }
    .ebarimt { margin-top: 26px; padding: 10px 12px; border: 1px solid #d0d4da; }
    .ebarimt td { vertical-align: top; }
    .stamp { position: absolute; top: 260px; left: 120px; transform: rotate(-18deg); font-size: 46px; font-weight: bold; color: rgba(220, 38, 38, .22); border: 6px solid rgba(220, 38, 38, .22); padding: 6px 22px; }
    .foot { position: fixed; bottom: -10px; left: 0; right: 0; text-align: center; }
</style>
</head>
<body>
@if ($refunded)
    <div class="stamp">БУЦААСАН · REFUNDED</div>
@endif

<table class="head">
    <tr>
        <td>
            <h1>Төлбөрийн баримт</h1>
            <div class="muted">Receipt · {{ $r->number }}</div>
        </td>
        <td class="num">
            <div class="label">Огноо · Date</div>
            <div>{{ $r->issued_at->timezone(config('app.timezone'))->format('Y.m.d H:i') }}</div>
            <div class="label" style="margin-top: 6px">Төлбөр · Payment</div>
            <div class="small">{{ strtoupper(substr($r->payment_id, -10)) }}</div>
        </td>
    </tr>
</table>

<table class="parties">
    <tr>
        <td>
            <div class="label">Худалдагч · Seller</div>
            <strong>{{ $seller['name'] }}</strong><br>
            @if ($seller['register']) РД: {{ $seller['register'] }}<br> @endif
            @if ($seller['address']) {{ $seller['address'] }}<br> @endif
            @if ($seller['email']) {{ $seller['email'] }} @endif
            @if ($seller['phone']) · {{ $seller['phone'] }} @endif
            @if ($seller['bank'])<br>{{ $seller['bank'] }} @endif
        </td>
        <td>
            <div class="label">Худалдан авагч · Buyer</div>
            <strong>{{ $r->buyer_name }}</strong><br>
            @if ($r->buyer_register) РД: {{ $r->buyer_register }}<br> @endif
            @if ($r->buyer_email) {{ $r->buyer_email }} @endif
        </td>
    </tr>
</table>

<table class="lines">
    <thead>
        <tr>
            <th>Үйлчилгээ · Service</th>
            <th class="num">Тоо · Qty</th>
            <th class="num">Нэгж үнэ · Unit</th>
            <th class="num">Дүн · Amount</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>{{ $r->description }}</td>
            <td class="num">{{ $r->quantity }} хоног</td>
            <td class="num">{{ $mnt(intdiv($r->total, max(1, $r->quantity))) }}</td>
            <td class="num">{{ $mnt($r->total) }}</td>
        </tr>
    </tbody>
</table>

<table class="totals">
    @if ($r->vat_percent > 0)
        <tr><td class="muted">НӨАТ-гүй дүн · Net</td><td class="num">{{ $mnt($r->net()) }}</td></tr>
        <tr><td class="muted">НӨАТ {{ $r->vat_percent }}% · VAT</td><td class="num">{{ $mnt($r->vat) }}</td></tr>
    @endif
    <tr class="grand"><td>Нийт · Total</td><td class="num">{{ $mnt($r->total) }}</td></tr>
</table>
@if ($r->vat_percent > 0)
    <p class="muted small" style="text-align: right">Үнэд НӨАТ багтсан · Prices include VAT</p>
@endif

@if ($r->ebarimt_status === 'issued')
    <table class="ebarimt">
        <tr>
            <td>
                <div class="label">И-баримт · e-barimt</div>
                ДДТД: <strong>{{ $r->ebarimt_id }}</strong><br>
                @if ($r->ebarimt_lottery) Сугалаа: {{ $r->ebarimt_lottery }}<br> @endif
                Огноо: {{ $r->ebarimt_date?->format('Y.m.d H:i') }}
            </td>
            @if ($qr)
                <td class="num" style="width: 120px"><img src="{{ $qr }}" width="110" height="110" alt=""></td>
            @endif
        </tr>
    </table>
@elseif ($r->ebarimt_status === 'returned')
    <p class="muted" style="margin-top: 22px">И-баримт буцаагдсан · e-barimt returned ({{ $r->ebarimt_id }})</p>
@elseif ($r->ebarimt_status !== 'none')
    <p class="muted" style="margin-top: 22px">И-баримт бүртгэгдэж байна · e-barimt is being registered</p>
@endif

<div class="foot muted small">{{ $seller['name'] }} · {{ config('app.url') }}</div>
</body>
</html>
