<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'atmosphere_id', 'status', 'progress', 'current_stage',
    'error', 'started_at', 'finished_at',
])]
class GenerationJob extends Model
{
    protected function casts(): array
    {
        return [
            'progress' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function atmosphere(): BelongsTo
    {
        return $this->belongsTo(Atmosphere::class);
    }
}
