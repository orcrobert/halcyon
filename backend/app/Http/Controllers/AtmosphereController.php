<?php

namespace App\Http\Controllers;

use App\Http\Resources\AtmosphereResource;
use App\Jobs\GenerateAtmosphereJob;
use App\Models\Atmosphere;
use App\Models\GenerationJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AtmosphereController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $atmospheres = $request->user()
            ->atmospheres()
            ->with('generationJob')
            ->latest()
            ->paginate(20);

        return AtmosphereResource::collection($atmospheres);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:3', 'max:1000'],
            'title' => ['nullable', 'string', 'max:255'],
            'style_clip_id' => ['nullable', 'integer', 'exists:style_clips,id'],
        ]);

        if (isset($data['style_clip_id'])) {
            $owns = $request->user()->styleClips()->whereKey($data['style_clip_id'])->exists();
            abort_unless($owns, 403, 'Style clip does not belong to you.');
        }

        $atmosphere = $request->user()->atmospheres()->create([
            'prompt' => $data['prompt'],
            'title' => $data['title'] ?? null,
            'style_clip_id' => $data['style_clip_id'] ?? null,
            'status' => 'pending',
        ]);

        GenerationJob::create([
            'atmosphere_id' => $atmosphere->id,
            'status' => 'queued',
        ]);

        GenerateAtmosphereJob::dispatch($atmosphere);

        return (new AtmosphereResource($atmosphere->load('generationJob')))
            ->response()
            ->setStatusCode(202);
    }

    public function show(Request $request, Atmosphere $atmosphere): AtmosphereResource
    {
        $this->authorizeOwnership($request, $atmosphere);

        return new AtmosphereResource(
            $atmosphere->load(['elements', 'generationJob']),
        );
    }

    public function destroy(Request $request, Atmosphere $atmosphere): JsonResponse
    {
        $this->authorizeOwnership($request, $atmosphere);

        $atmosphere->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    private function authorizeOwnership(Request $request, Atmosphere $atmosphere): void
    {
        abort_unless($atmosphere->user_id === $request->user()->id, 403);
    }
}
