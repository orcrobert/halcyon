<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

class ElementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'type' => $this->type,
            'prompt' => $this->prompt,
            'duration_s' => $this->duration_s,
            'position' => $this->position,
            'volume' => $this->volume,
            'pan' => $this->pan,
            'depth' => $this->depth,
            'tuning_hz' => $this->tuning_hz,
            'eq_json' => $this->eq_json,
            'original' => [
                'volume' => $this->original_volume,
                'pan' => $this->original_pan,
                'depth' => $this->original_depth,
                'eq_json' => $this->original_eq_json,
            ],
            'audio_url' => $this->audio_path
                ? URL::temporarySignedRoute(
                    'elements.audio',
                    now()->addHours(2),
                    [
                        'element' => $this->id,
                        'user' => $request->user()?->id ?? $this->atmosphere->user_id,
                    ],
                )
                : null,
        ];
    }
}
