<?php

namespace App\Jobs;

use App\Models\Atmosphere;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

class GenerateAtmosphereJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;
    public int $tries = 1;

    public function __construct(public Atmosphere $atmosphere) {}

    public function handle(): void
    {
        $job = $this->atmosphere->generationJob;

        $this->atmosphere->update(['status' => 'generating']);
        $job->update([
            'status' => 'running',
            'current_stage' => 'decomposing',
            'started_at' => now(),
        ]);

        $payload = ['prompt' => $this->atmosphere->prompt];

        $response = Http::timeout($this->timeout)
            ->withHeaders([
                'X-AI-Service-Secret' => config('services.ai.secret'),
                'Accept' => 'application/json',
            ])
            ->acceptJson()
            ->post(rtrim(config('services.ai.url'), '/').'/generate', $payload);

        if ($response->failed()) {
            throw new \RuntimeException(
                "AI service returned {$response->status()}: ".$response->body()
            );
        }

        $body = $response->json();
        $elements = $body['elements'] ?? [];

        if (empty($elements)) {
            throw new \RuntimeException('AI service returned no elements.');
        }

        $job->update(['current_stage' => 'persisting', 'progress' => 80]);

        DB::transaction(function () use ($body, $elements) {
            $this->atmosphere->update([
                'decomposed_json' => $body,
                'title' => $this->atmosphere->title ?? ($body['atmosphere'] ?? null),
            ]);

            foreach ($elements as $i => $el) {
                $audioPath = $this->persistAudio($el, $i);

                $eq = $el['eq'] ?? [];
                $volume = (float) ($el['volume'] ?? 0.8);
                $pan = (float) ($el['pan'] ?? 0.0);
                $depth = (float) ($el['depth'] ?? 0.0);

                $this->atmosphere->elements()->create([
                    'label' => $el['label'] ?? "element_{$i}",
                    'type' => $el['type'] ?? 'sound',
                    'prompt' => $el['prompt'] ?? '',
                    'audio_path' => $audioPath,
                    'duration_s' => $el['duration_s'] ?? null,
                    'volume' => $volume,
                    'pan' => $pan,
                    'depth' => $depth,
                    'tuning_hz' => 440,
                    'eq_json' => $eq,
                    'original_volume' => $volume,
                    'original_pan' => $pan,
                    'original_depth' => $depth,
                    'original_eq_json' => $eq,
                    'position' => $i,
                ]);
            }
        });

        $this->atmosphere->update([
            'status' => 'ready',
            'generated_at' => now(),
        ]);

        $job->update([
            'status' => 'completed',
            'current_stage' => 'done',
            'progress' => 100,
            'finished_at' => now(),
        ]);
    }

    private function persistAudio(array $element, int $index): string
    {
        $b64 = $element['audio_b64'] ?? null;
        if (! $b64) {
            throw new \RuntimeException("Element {$index} missing audio_b64.");
        }

        $bytes = base64_decode($b64, strict: true);
        if ($bytes === false) {
            throw new \RuntimeException("Element {$index} has invalid base64 audio.");
        }

        $label = preg_replace('/[^a-z0-9_-]/i', '_', $element['label'] ?? "el_{$index}");
        $path = "atmospheres/{$this->atmosphere->id}/{$label}.wav";

        Storage::put($path, $bytes);

        return $path;
    }

    public function failed(Throwable $e): void
    {
        Log::error('GenerateAtmosphereJob failed', [
            'atmosphere_id' => $this->atmosphere->id,
            'error' => $e->getMessage(),
        ]);

        $this->atmosphere->update([
            'status' => 'failed',
            'error' => $e->getMessage(),
        ]);

        $this->atmosphere->generationJob?->update([
            'status' => 'failed',
            'error' => $e->getMessage(),
            'finished_at' => now(),
        ]);
    }
}
