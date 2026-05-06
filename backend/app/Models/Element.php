<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\AsArrayObject;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'atmosphere_id', 'label', 'type', 'prompt', 'audio_path', 'duration_s',
    'volume', 'pan', 'depth', 'tuning_hz', 'eq_json',
    'original_volume', 'original_pan', 'original_depth', 'original_eq_json',
    'position',
])]
class Element extends Model
{
    protected function casts(): array
    {
        return [
            'volume' => 'float',
            'pan' => 'float',
            'depth' => 'float',
            'tuning_hz' => 'integer',
            'duration_s' => 'float',
            'eq_json' => AsArrayObject::class,
            'original_volume' => 'float',
            'original_pan' => 'float',
            'original_depth' => 'float',
            'original_eq_json' => AsArrayObject::class,
        ];
    }

    public function atmosphere(): BelongsTo
    {
        return $this->belongsTo(Atmosphere::class);
    }
}
