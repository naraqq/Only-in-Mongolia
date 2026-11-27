<?php

/*
|--------------------------------------------------------------------------
| Video processing (App\Media\Transcoding)
|--------------------------------------------------------------------------
|
| Every uploaded video is converted once, in the background, to an MP4 every browser and phone plays
| (H.264 + AAC, at most 720p by default, the index at the front so playback starts at once, location
| metadata removed), and gets a still frame and seek-bar frames. The original is removed afterwards.
| Needs ffmpeg on the server; without it, videos are kept as uploaded.
|
*/

return [

    'transcode' => (bool) env('MEDIA_TRANSCODE', true),

    'ffmpeg' => env('FFMPEG_PATH', 'ffmpeg'),

    'ffprobe' => env('FFPROBE_PATH', 'ffprobe'),

    // Longest side of the converted video, in pixels: 1280 = 720p, 1920 = 1080p.
    'video_max_side' => (int) env('MEDIA_VIDEO_MAX_SIDE', 1280),

    // Quality (lower is better and bigger): 23 is a good default for phone video at 720p.
    'video_crf' => (int) env('MEDIA_VIDEO_CRF', 23),

    // Most bits per second for the picture, so a busy scene never outgrows a phone connection.
    'video_max_kbps' => (int) env('MEDIA_VIDEO_MAX_KBPS', 4000),

    // How long one conversion may take (a 2 GB video at 4K can take a while on a small server).
    'timeout' => (int) env('MEDIA_TRANSCODE_TIMEOUT', 7200),

];
