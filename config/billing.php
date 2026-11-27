<?php

/*
|--------------------------------------------------------------------------
| Invoices and receipts for companies (App\Billing)
|--------------------------------------------------------------------------
|
| Every paid sponsored campaign gets a receipt (төлбөрийн баримт) the company can download as a PDF, with the
| seller's and buyer's details and the VAT in the price. With e-barimt switched on, it's also registered with
| the tax office through PosAPI 3.0 (a B2B receipt to the company's TIN) and the PDF carries its number and QR.
|
*/

return [

    // Who sells: shown at the top of every receipt.
    'seller' => [
        'name' => env('BILLING_SELLER_NAME', 'Only in Mongolia ХХК'),
        'register' => env('BILLING_SELLER_REGISTER', ''), // улсын бүртгэлийн дугаар (7 digits)
        'address' => env('BILLING_SELLER_ADDRESS', 'Улаанбаатар хот'),
        'email' => env('BILLING_SELLER_EMAIL', ''),
        'phone' => env('BILLING_SELLER_PHONE', ''),
        'bank' => env('BILLING_SELLER_BANK', ''), // e.g. "Хаан банк 5000 1234 56"
    ],

    // Prices include VAT at this rate (%). 0 = not VAT registered: no VAT line, and e-barimt gets the no-VAT type.
    'vat_percent' => (int) env('BILLING_VAT_PERCENT', 10),

    // Receipt numbers: OIM-2026-000001, counting up within each year.
    'number_prefix' => env('BILLING_NUMBER_PREFIX', 'OIM'),

    /*
    | e-barimt (PosAPI 3.0). "none" = off (the PDF receipt only); "posapi" = register each receipt with the tax
    | office. PosAPI 3.0 is a service the tax office provides, installed on (or next to) this server; the values
    | below come from your registration with it. Check every one against your PosAPI documentation before switching on.
    */
    'ebarimt' => [
        'driver' => env('EBARIMT_DRIVER', 'none'),
        // The local PosAPI 3.0 service.
        'url' => env('EBARIMT_POSAPI_URL', 'http://localhost:7080'),
        // Your TIN (ТТД, not the 7-digit register number), POS number and branch, from your registration.
        'merchant_tin' => env('EBARIMT_MERCHANT_TIN', ''),
        'pos_no' => env('EBARIMT_POS_NO', ''),
        'branch_no' => env('EBARIMT_BRANCH_NO', '001'),
        // Where you're registered (дүүрэг/хорооны код).
        'district_code' => env('EBARIMT_DISTRICT_CODE', ''),
        // The product classification code for advertising services (бүтээгдэхүүний ангиллын код). Ask your accountant.
        'classification_code' => env('EBARIMT_CLASSIFICATION_CODE', ''),
        // Turning a buyer's 7-digit register number into their TIN, for B2B receipts. {reg} is replaced.
        'tin_lookup_url' => env('EBARIMT_TIN_LOOKUP_URL', 'https://api.ebarimt.mn/api/info/check/getTinInfo?regNo={reg}'),
        'timeout' => (int) env('EBARIMT_TIMEOUT', 20),
    ],

];
