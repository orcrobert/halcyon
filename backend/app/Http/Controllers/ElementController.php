<?php

namespace App\Http\Controllers;

use App\Http\Resources\ElementResource;
use App\Models\Element;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ElementController extends Controller
{
    public function update(Request $request, Element $element): ElementResource
    {
        $this->authorizeOwnership($request, $element);

        $data = $request->validate([
            'volume' => ['sometimes', 'numeric', 'between:0,2'],
            'pan' => ['sometimes', 'numeric', 'between:-1,1'],
            'depth' => ['sometimes', 'numeric', 'between:0,1'],
            'tuning_hz' => ['sometimes', 'integer', 'between:200,800'],
            'eq_json' => ['sometimes', 'array'],
            'eq_json.*.freq' => ['required_with:eq_json', 'numeric', 'between:20,20000'],
            'eq_json.*.gain' => ['required_with:eq_json', 'numeric', 'between:-24,24'],
            'eq_json.*.q' => ['required_with:eq_json', 'numeric', 'between:0.1,10'],
            'eq_json.*.type' => ['required_with:eq_json', 'string', 'in:lowshelf,peaking,highshelf'],
        ]);

        $element->update($data);

        return new ElementResource($element);
    }

    public function reset(Request $request, Element $element): ElementResource
    {
        $this->authorizeOwnership($request, $element);

        $element->update([
            'volume' => $element->original_volume,
            'pan' => $element->original_pan,
            'depth' => $element->original_depth,
            'tuning_hz' => 440,
            'eq_json' => $element->original_eq_json,
        ]);

        return new ElementResource($element);
    }

    public function audio(Request $request, Element $element): StreamedResponse
    {
        abort_unless($request->hasValidSignature(), 403);
        abort_unless(Storage::exists($element->audio_path), 404);

        return Storage::download(
            $element->audio_path,
            "{$element->label}.wav",
            ['Content-Type' => 'audio/wav'],
        );
    }

    private function authorizeOwnership(Request $request, Element $element): void
    {
        abort_unless($element->atmosphere->user_id === $request->user()->id, 403);
    }
}
