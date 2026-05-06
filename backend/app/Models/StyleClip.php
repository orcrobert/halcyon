<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'name', 'audio_path', 'duration_s'])]
class StyleClip extends Model
{
    protected function casts(): array
    {
        return [
            'duration_s' => 'float',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function atmospheres(): HasMany
    {
        return $this->hasMany(Atmosphere::class);
    }
}
