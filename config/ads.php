<?php

/*
|--------------------------------------------------------------------------
| Sponsored banners that companies buy themselves (App\Http\Controllers\BusinessController)
|--------------------------------------------------------------------------
*/

return [

    // What one day of a banner costs, in ₮. A campaign costs this × its days, paid up front.
    'daily_price' => (int) env('ADS_DAILY_PRICE', 20000),

    // The longest one campaign may run.
    'max_days' => (int) env('ADS_MAX_DAYS', 90),

    // Video banners: the longest and largest a company may upload.
    'video_max_seconds' => (int) env('ADS_VIDEO_MAX_SECONDS', 60),

    'video_max_mb' => (int) env('ADS_VIDEO_MAX_MB', 100),

];
