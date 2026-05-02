<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\AsArrayObject;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'user_id', 'style_clip_id', 'title', 'prompt',
    'status', 'decomposed_json', 'error', 'generated_at',
])]
class Atmosphere extends Model
{
    protected function casts(): array
    {
        return [
            'decomposed_json' => AsArrayObject::class,
            'generated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function styleClip(): BelongsTo
    {
        return $this->belongsTo(StyleClip::class);
    }

    public function elements(): HasMany
    {
        return $this->hasMany(Element::class)->orderBy('position');
    }

    public function generationJob(): HasOne
    {
        return $this->hasOne(GenerationJob::class)->latestOfMany();
    }
}
