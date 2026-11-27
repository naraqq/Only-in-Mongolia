<?php

use App\Http\Controllers\AdController;
use App\Http\Controllers\BusinessController;
use App\Http\Controllers\Admin\AdController as AdminAdController;
use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\CreatorReviewController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\PayoutController;
use App\Http\Controllers\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\BlockController;
use App\Http\Controllers\CreatorApplicationController;
use App\Http\Controllers\CreatorPageController;
use App\Http\Controllers\EarningsController;
use App\Http\Controllers\EngagementController;
use App\Http\Controllers\FanController;
use App\Http\Controllers\FansController;
use App\Http\Controllers\InsightsController;
use App\Http\Controllers\LibraryController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PollController;
use App\Http\Controllers\PreferencesController;
use App\Http\Controllers\ProfileEditController;
use App\Http\Controllers\PromotionController;
use App\Http\Controllers\PushController;
use App\Http\Controllers\QaController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SeriesController;
use App\Http\Controllers\StudioController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\WalletController;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\RecordAdminAction;
use App\Http\Middleware\SetLocale;
use App\Support\Appearance;
use Illuminate\Support\Facades\Route;

// Language switch (МН / EN), remembered in the session.
Route::post('appearance/{mode}', [PreferencesController::class, 'appearance'])->whereIn('mode', Appearance::MODES)->middleware('throttle:30,1')->name('appearance');
Route::post('locale/{locale}', function (string $locale) {
    session(['locale' => $locale]);
    request()->user()?->forceFill(['locale' => $locale])->saveQuietly(); // the account remembers it too (push text)

    return back();
})->whereIn('locale', SetLocale::SUPPORTED)->name('locale');

Route::get('/', [FanController::class, 'home'])->name('home');
Route::get('creators', [FanController::class, 'discover'])->name('creators');
Route::get('search', SearchController::class)->middleware('throttle:60,1')->name('search');
Route::get('search/suggest', [SearchController::class, 'suggest'])->middleware('throttle:120,1')->name('search.suggest');
Route::post('posts/views', [InsightsController::class, 'views'])->middleware('throttle:60,1')->name('posts.views');
Route::post('visits', [InsightsController::class, 'visit'])->middleware('throttle:60,1')->name('visits');
// Live Q&A: anyone who can see the post can read it (the page refreshes it while live).
Route::get('posts/{post}/qa', [QaController::class, 'show'])->middleware('throttle:120,1')->name('posts.qa');
// Sponsored banners (right-hand column): which to show, views on screen, clicks through to the advertiser.
Route::get('ads/slot', [AdController::class, 'slot'])->middleware('throttle:120,1')->name('ads.slot');
Route::post('ads/views', [AdController::class, 'views'])->middleware('throttle:120,1')->name('ads.views');
Route::get('ads/{ad}/go', [AdController::class, 'go'])->middleware('throttle:60,1')->name('ads.go');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [FanController::class, 'dashboard'])->name('dashboard');
    Route::get('wallet', [WalletController::class, 'index'])->name('wallet');
    Route::delete('search/recent', [PreferencesController::class, 'clearSearches'])->name('search.recent.clear');
    Route::delete('search/recent/one', [PreferencesController::class, 'forgetSearch'])->name('search.recent.forget');
    Route::post('wallet/renew/{handle}', [WalletController::class, 'renew'])->middleware('throttle:10,1')->name('wallet.renew');
    Route::post('wallet/auto-renew/{handle}', [WalletController::class, 'autoRenew'])->name('wallet.auto-renew');
    Route::post('wallet/topup', [PaymentController::class, 'topup'])->middleware('throttle:10,1')->name('wallet.topup');
    Route::get('feed', [FanController::class, 'feed'])->name('feed');
    Route::post('@{handle}/follow', [FanController::class, 'follow'])->middleware('throttle:60,1')->name('creator.follow');
    Route::delete('@{handle}/follow', [FanController::class, 'unfollow'])->middleware('throttle:60,1')->name('creator.unfollow');

    // Subscriptions: subscribe -> QPay checkout -> paid (status is polled; QPay also calls back).
    Route::get('@{handle}/subscribe', [PaymentController::class, 'plan'])->name('creator.checkout');
    Route::post('@{handle}/trial', [PromotionController::class, 'startTrial'])->middleware('throttle:10,1')->name('creator.trial');
    Route::get('@{handle}/promo', [PromotionController::class, 'checkCode'])->middleware('throttle:30,1')->name('creator.promo');
    Route::post('@{handle}/subscribe', [PaymentController::class, 'subscribe'])->middleware('throttle:10,1')->name('creator.subscribe');
    Route::post('@{handle}/tip', [PaymentController::class, 'tip'])->middleware('throttle:10,1')->name('creator.tip');
    Route::post('posts/{post}/buy', [PaymentController::class, 'buyPost'])->middleware('throttle:10,1')->name('posts.buy');
    Route::post('message/{message}/buy', [PaymentController::class, 'buyMessage'])->middleware('throttle:10,1')->name('messages.buy');
    Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');
    Route::get('payments/{payment}/status', [PaymentController::class, 'status'])->middleware('throttle:60,1')->name('payments.status');
    Route::post('payments/{payment}/fake-pay', [PaymentController::class, 'fakePay'])->name('payments.fake-pay');

    // Likes, comments, saved posts.
    Route::post('posts/{post}/like', [EngagementController::class, 'like'])->middleware('throttle:120,1')->name('posts.like');
    Route::post('posts/{post}/poll/vote', [PollController::class, 'vote'])->middleware('throttle:30,1')->name('posts.poll.vote');
    Route::post('posts/{post}/poll/follow-up', [PollController::class, 'followUp'])->middleware('throttle:20,1')->name('posts.poll.follow-up');
    Route::post('posts/{post}/qa/rsvp', [QaController::class, 'rsvp'])->middleware('throttle:30,1')->name('posts.qa.rsvp');
    Route::post('posts/{post}/qa/questions', [QaController::class, 'ask'])->middleware('throttle:10,1')->name('posts.qa.ask');
    Route::post('qa-questions/{question}/vote', [QaController::class, 'vote'])->middleware('throttle:120,1')->name('qa.vote');
    Route::post('qa-questions/{question}/answer', [QaController::class, 'answer'])->middleware('throttle:60,1')->name('qa.answer');
    Route::post('qa-questions/{question}/hide', [QaController::class, 'hide'])->middleware('throttle:60,1')->name('qa.hide');
    Route::post('posts/{post}/bookmark', [EngagementController::class, 'bookmark'])->middleware('throttle:120,1')->name('posts.bookmark');
    Route::get('posts/{post}/comments', [EngagementController::class, 'comments'])->name('posts.comments');
    Route::post('posts/{post}/comments', [EngagementController::class, 'comment'])->middleware('throttle:20,1')->name('posts.comment');
    Route::delete('comments/{comment}', [EngagementController::class, 'deleteComment'])->name('comments.destroy');
    Route::post('comments/{comment}/like', [EngagementController::class, 'likeComment'])->middleware('throttle:120,1')->name('comments.like');
    Route::get('saved', [EngagementController::class, 'saved'])->name('saved');

    // Safety: report something, block someone.
    Route::post('reports', [ReportController::class, 'store'])->middleware('throttle:20,60')->name('reports.store');
    Route::post('users/{user}/block', [BlockController::class, 'toggle'])->middleware('throttle:30,1')->name('users.block');

    // Notifications (the bell). Each stays new until it's opened, or all are marked read.
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications');
    // Push notifications on this device (the browser's subscription).
    Route::post('push/subscriptions', [PushController::class, 'store'])->middleware('throttle:20,1')->name('push.subscribe');
    Route::delete('push/subscriptions', [PushController::class, 'destroy'])->middleware('throttle:20,1')->name('push.unsubscribe');
    Route::post('notifications/read-all', [NotificationController::class, 'readAll'])->name('notifications.read-all');
    Route::post('notifications/{id}/open', [NotificationController::class, 'open'])->whereUuid('id')->name('notifications.open');

    // Direct messages (the page polls for new ones).
    Route::get('messages', [MessageController::class, 'index'])->name('messages.index');
    Route::get('messages/{conversation}', [MessageController::class, 'index'])->name('messages.show');
    Route::post('messages/{conversation}', [MessageController::class, 'send'])->middleware('throttle:60,1')->name('messages.send');
    Route::get('message-media/{media}', [MessageController::class, 'media'])->name('messages.media');
    Route::get('message-media/{media}/{which}', [MessageController::class, 'mediaPreview'])->whereIn('which', ['poster', 'thumbs'])->name('messages.media.preview');
    Route::post('@{handle}/message', [MessageController::class, 'start'])->middleware('throttle:30,1')->name('creator.message');
    Route::post('studio/mass-message', [MessageController::class, 'mass'])->middleware('throttle:5,60')->name('studio.mass');

    // Edit profile: name, photo, and for creators the cover, bio, price and who may message them.
    Route::get('profile', [ProfileEditController::class, 'edit'])->name('me.edit');
    Route::patch('profile', [ProfileEditController::class, 'update'])->name('me.update');
    Route::post('profile/photo/{kind}', [ProfileEditController::class, 'photo'])->whereIn('kind', ['avatar', 'cover'])->middleware('throttle:20,60')->name('me.photo');
    Route::delete('profile/photo/{kind}', [ProfileEditController::class, 'removePhoto'])->whereIn('kind', ['avatar', 'cover'])->name('me.photo.destroy');

    // Become a creator: apply, then wait for admin review.
    Route::get('creator/apply', [CreatorApplicationController::class, 'show'])->name('creator.apply');
    Route::post('creator/apply', [CreatorApplicationController::class, 'store'])->middleware('throttle:5,60')->name('creator.apply.store');

    // Studio: approved creators write and manage posts.
    Route::get('studio', [StudioController::class, 'index'])->name('studio');
    // The same inbox and profile form, inside the studio's own layout.
    Route::get('studio/messages', [MessageController::class, 'index'])->name('studio.messages');
    Route::get('studio/messages/{conversation}', [MessageController::class, 'index'])->name('studio.messages.show');
    Route::get('studio/profile', [ProfileEditController::class, 'edit'])->name('studio.profile');
    Route::get('studio/insights', [InsightsController::class, 'index'])->name('studio.insights');
    Route::get('studio/promotions', [PromotionController::class, 'index'])->name('studio.promotions');
    Route::put('studio/promotions/trial', [PromotionController::class, 'updateTrial'])->name('studio.trial');
    Route::put('studio/promotions/welcome', [PromotionController::class, 'updateWelcome'])->name('studio.welcome');
    Route::post('studio/promotions/codes', [PromotionController::class, 'storeCode'])->name('studio.codes.store');
    Route::post('studio/promotions/codes/{code}/toggle', [PromotionController::class, 'toggleCode'])->name('studio.codes.toggle');
    Route::get('studio/fans', [FansController::class, 'index'])->name('studio.fans');
    Route::get('studio/fans/audiences', [FansController::class, 'audiences'])->name('studio.fans.audiences');
    Route::post('studio/fans/lists', [FansController::class, 'storeList'])->name('studio.lists.store');
    Route::patch('studio/fans/lists/{list}', [FansController::class, 'updateList'])->name('studio.lists.update');
    Route::delete('studio/fans/lists/{list}', [FansController::class, 'destroyList'])->name('studio.lists.destroy');
    Route::post('studio/fans/{user}/message', [FansController::class, 'message'])->middleware('throttle:30,1')->name('studio.fans.message');
    Route::delete('studio/fans/{user}/follow', [FansController::class, 'removeFollower'])->middleware('throttle:60,1')->name('studio.fans.unfollow');
    Route::post('studio/fans/lists/{list}/members/{user}', [FansController::class, 'toggle'])->name('studio.lists.toggle');
    Route::get('studio/library', [LibraryController::class, 'index'])->name('studio.library');
    Route::get('studio/series', [SeriesController::class, 'index'])->name('studio.series');
    Route::post('studio/series', [SeriesController::class, 'store'])->middleware('throttle:20,1')->name('studio.series.store');
    Route::patch('studio/series/{series}', [SeriesController::class, 'update'])->whereNumber('series')->name('studio.series.update');
    Route::delete('studio/series/{series}', [SeriesController::class, 'destroy'])->whereNumber('series')->name('studio.series.destroy');
    Route::get('studio/library/items', [LibraryController::class, 'list'])->name('studio.library.items');
    Route::post('studio/library', [LibraryController::class, 'store'])->middleware('throttle:30,60')->name('studio.library.store');
    Route::delete('studio/library', [LibraryController::class, 'destroyMany'])->name('studio.library.destroy-many');
    Route::delete('studio/library/{item}', [LibraryController::class, 'destroy'])->name('studio.library.destroy');
    Route::get('studio/library/{item}/usage', [LibraryController::class, 'usage'])->name('studio.library.usage');
    Route::get('studio/library/{item}/file', [LibraryController::class, 'file'])->name('studio.library.file');
    Route::get('studio/library/{item}/{which}', [LibraryController::class, 'preview'])->whereIn('which', ['poster', 'thumbs'])->name('studio.library.preview');
    Route::get('studio/earnings', [EarningsController::class, 'index'])->name('studio.earnings');
    Route::post('studio/earnings/payout', [EarningsController::class, 'requestPayout'])->middleware('throttle:10,60')->name('studio.payout');
    Route::get('studio/earnings/statement.csv', [EarningsController::class, 'statement'])->name('studio.statement');
    // Big files go up in pieces before the post is published (App\Media\ChunkedUploads).
    Route::post('uploads', [UploadController::class, 'start'])->middleware('throttle:120,1')->name('uploads.start');
    Route::get('uploads/{upload}', [UploadController::class, 'show'])->name('uploads.show');
    Route::post('uploads/{upload}/chunks/{index}', [UploadController::class, 'chunk'])->whereNumber('index')->middleware('throttle:1200,1')->name('uploads.chunk');
    Route::post('uploads/{upload}/complete', [UploadController::class, 'complete'])->middleware('throttle:120,1')->name('uploads.complete');
    Route::post('uploads/{upload}/preview', [UploadController::class, 'preview'])->middleware('throttle:120,1')->name('uploads.preview');
    Route::delete('uploads/{upload}', [UploadController::class, 'destroy'])->name('uploads.destroy');
    Route::post('studio/posts', [StudioController::class, 'store'])->middleware('throttle:30,60')->name('studio.posts.store');
    Route::patch('studio/posts/{post}', [StudioController::class, 'update'])->name('studio.posts.update');
    Route::post('studio/posts/{post}/pin', [StudioController::class, 'pin'])->name('studio.posts.pin');
    Route::delete('studio/posts/{post}', [StudioController::class, 'destroy'])->name('studio.posts.destroy');
});

// Companies advertising by themselves (sponsored banners): their company, campaigns and reports.
Route::middleware('auth')->prefix('business')->name('business')->group(function () {
    Route::get('/', [BusinessController::class, 'index']);
    Route::get('company', [BusinessController::class, 'company'])->name('.company');
    Route::post('company', [BusinessController::class, 'saveCompany'])->middleware('throttle:20,60')->name('.company.save');
    Route::get('campaigns/new', [BusinessController::class, 'create'])->name('.campaigns.new');
    Route::post('campaigns', [BusinessController::class, 'store'])->middleware('throttle:20,60')->name('.campaigns.store');
    Route::post('campaigns/{ad}/pay', [BusinessController::class, 'pay'])->middleware('throttle:30,60')->name('.campaigns.pay');
    Route::post('campaigns/{ad}/toggle', [BusinessController::class, 'toggle'])->name('.campaigns.toggle');
    Route::delete('campaigns/{ad}', [BusinessController::class, 'destroy'])->name('.campaigns.destroy');
    Route::get('campaigns/{ad}/report.csv', [BusinessController::class, 'report'])->name('.campaigns.report');
    Route::get('receipts/{receipt}.pdf', [BusinessController::class, 'receipt'])->name('.receipts.show');
});

// QPay's server-to-server notification. It only makes us ask QPay for the status, so it can be public.
Route::match(['get', 'post'], 'payments/{payment}/callback', [PaymentController::class, 'callback'])->middleware('throttle:60,1')->name('payments.callback');

// Photos and videos, only after a permission check (see MediaController).
Route::get('media/{media}', [MediaController::class, 'show'])->name('media.show');
Route::get('media/{media}/{which}', [MediaController::class, 'preview'])->whereIn('which', ['poster', 'thumbs'])->name('media.preview');

Route::middleware(['auth', EnsureAdmin::class, RecordAdminAction::class])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', [DashboardController::class, 'index'])->name('dashboard');
    Route::get('creators', [CreatorReviewController::class, 'index'])->name('creators');
    Route::get('creators/{creator}/document/{kind}', [CreatorReviewController::class, 'document'])->whereIn('kind', ['front', 'back', 'selfie'])->name('creators.document');
    Route::post('creators/{creator}/decide', [CreatorReviewController::class, 'decide'])->name('creators.decide');
    Route::get('payouts', [PayoutController::class, 'index'])->name('payouts');
    Route::get('reports', [AdminReportController::class, 'index'])->name('reports');
    Route::post('reports/{report}/act', [AdminReportController::class, 'act'])->name('reports.act');
    Route::post('creators/{creator}/reinstate', [AdminReportController::class, 'reinstate'])->name('creators.reinstate');
    Route::post('payouts/{payout}/decide', [PayoutController::class, 'decide'])->name('payouts.decide');
    Route::get('users', [AdminUserController::class, 'index'])->name('users');
    Route::get('audit', [AuditController::class, 'index'])->name('audit');
    Route::get('ads', [AdminAdController::class, 'index'])->name('ads');
    Route::post('ads', [AdminAdController::class, 'store'])->name('ads.store');
    Route::post('ads/{ad}', [AdminAdController::class, 'update'])->name('ads.update');
    Route::post('ads/{ad}/toggle', [AdminAdController::class, 'toggle'])->name('ads.toggle');
    Route::delete('ads/{ad}', [AdminAdController::class, 'destroy'])->name('ads.destroy');
    Route::post('ads/{ad}/approve', [AdminAdController::class, 'approve'])->name('ads.approve');
    Route::post('ads/{ad}/reject', [AdminAdController::class, 'reject'])->name('ads.reject');
    Route::get('receipts/{receipt}.pdf', [AdminAdController::class, 'receipt'])->name('receipts.show');
    Route::get('ads/{ad}/report.csv', [AdminAdController::class, 'report'])->name('ads.report');
    Route::get('users/{user}', [AdminUserController::class, 'show'])->name('users.show');
    Route::post('users/{user}/ban', [AdminUserController::class, 'ban'])->name('users.ban');
    Route::post('users/{user}/unban', [AdminUserController::class, 'unban'])->name('users.unban');
    Route::post('users/{user}/admin', [AdminUserController::class, 'toggleAdmin'])->name('users.admin');
    Route::post('payments/{payment}/refund', [AdminUserController::class, 'refund'])->name('payments.refund');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

// Creator pages: /@handle. Last, so it never shadows another route.
Route::get('@{handle}/series/{series}', [SeriesController::class, 'show'])->where('handle', '[A-Za-z0-9_.]{3,30}')->whereNumber('series')->name('creator.series');
Route::get('@{handle}', [CreatorPageController::class, 'show'])->where('handle', '[A-Za-z0-9_.]{3,30}')->name('creator.show');
