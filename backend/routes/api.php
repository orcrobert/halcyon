<?php

use App\Http\Controllers\AtmosphereController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\ElementController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/elements/{element}/audio', [ElementController::class, 'audio'])
    ->name('elements.audio');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/atmospheres', [AtmosphereController::class, 'index']);
    Route::post('/atmospheres', [AtmosphereController::class, 'store']);
    Route::get('/atmospheres/{atmosphere}', [AtmosphereController::class, 'show']);
    Route::delete('/atmospheres/{atmosphere}', [AtmosphereController::class, 'destroy']);

    Route::patch('/elements/{element}', [ElementController::class, 'update']);
    Route::post('/elements/{element}/reset', [ElementController::class, 'reset']);
});
