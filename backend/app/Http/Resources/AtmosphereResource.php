<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AtmosphereResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'prompt' => $this->prompt,
            'status' => $this->status,
            'style_clip_id' => $this->style_clip_id,
            'error' => $this->error,
            'generated_at' => $this->generated_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'elements' => ElementResource::collection($this->whenLoaded('elements')),
            'job' => $this->whenLoaded('generationJob', fn () => [
                'status' => $this->generationJob?->status,
                'progress' => $this->generationJob?->progress,
                'current_stage' => $this->generationJob?->current_stage,
                'error' => $this->generationJob?->error,
            ]),
        ];
    }
}
