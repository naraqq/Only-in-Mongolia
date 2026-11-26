<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminAction;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The admin audit log: who did what, to whom, when, and whether it went through. Read-only. */
class AuditController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'admin' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:60'],
        ]);

        $actions = AdminAction::with('admin:id,name')
            ->when($filters['admin'] ?? null, fn ($q, $id) => $q->where('admin_id', $id))
            ->when($filters['action'] ?? null, fn ($q, $a) => $q->where('action', $a))
            ->latest('id')->paginate(50)->withQueryString();

        return Inertia::render('admin/audit', [
            'actions' => $actions->through(fn (AdminAction $a) => [
                'id' => $a->id,
                'action' => $a->action,
                'admin' => $a->admin?->only('id', 'name'),
                'subject' => $a->subject_type ? ['type' => $a->subject_type, 'id' => $a->subject_id] : null,
                'data' => $a->data,
                'ok' => $a->ok,
                'ip' => $a->ip,
                'at' => $a->created_at->toIso8601String(),
            ]),
            'admins' => AdminAction::query()->whereNotNull('admin_id')->distinct()->pluck('admin_id')
                ->pipe(fn ($ids) => \App\Models\User::whereIn('id', $ids)->get(['id', 'name'])),
            'kinds' => AdminAction::query()->distinct()->orderBy('action')->pluck('action'),
            'filters' => $filters,
        ]);
    }
}
