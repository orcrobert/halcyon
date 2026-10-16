from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
FEATURES_PATH = ROOT / "data" / "processed" / "features.parquet"
MODELS_DIR = ROOT / "models"

FEATURE_COLS = [
    "loudness_db",
    "centroid",
    "bandwidth",
    "rolloff_85",
    "flatness",
    "zcr",
    "low_energy",
    "mid_energy",
    "high_energy",
    "onset_density",
]
TARGET = "pan"
RNG_SEED = 42


def recording_stratified_split(df: pd.DataFrame, test_size: float, val_size: float):
    recordings = df["recording_id"].unique()
    train_val_recs, test_recs = train_test_split(
        recordings, test_size=test_size, random_state=RNG_SEED
    )
    rel_val = val_size / (1.0 - test_size)
    train_recs, val_recs = train_test_split(
        train_val_recs, test_size=rel_val, random_state=RNG_SEED
    )
    train = df[df["recording_id"].isin(train_recs)].reset_index(drop=True)
    val = df[df["recording_id"].isin(val_recs)].reset_index(drop=True)
    test = df[df["recording_id"].isin(test_recs)].reset_index(drop=True)
    return train, val, test


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    sign_match = float(
        ((np.sign(y_true) == np.sign(y_pred)) | (np.abs(y_true) < 0.05)).mean()
    )
    return {
        "r2": float(r2_score(y_true, y_pred)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "sign_accuracy": sign_match,
        "catastrophic_rate": float(np.mean(np.abs(y_true - y_pred) > 0.5)),
        "n": int(len(y_true)),
    }


def cv_r2_on_train(model_factory, X: np.ndarray, y: np.ndarray, groups: np.ndarray, n_splits: int = 5):
    gkf = GroupKFold(n_splits=n_splits)
    scores = []
    for tr, va in gkf.split(X, y, groups=groups):
        scaler = StandardScaler().fit(X[tr])
        model = model_factory()
        model.fit(scaler.transform(X[tr]), y[tr])
        pred = model.predict(scaler.transform(X[va]))
        scores.append(r2_score(y[va], pred))
    return float(np.mean(scores)), float(np.std(scores))


def make_ridge_poly():
    return Pipeline([
        ("poly", PolynomialFeatures(degree=2, include_bias=False)),
        ("ridge", Ridge(alpha=1.0, random_state=RNG_SEED)),
    ])


def make_mlp():
    return MLPRegressor(
        hidden_layer_sizes=(64, 32),
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.15,
        random_state=RNG_SEED,
    )


def make_gbr():
    return GradientBoostingRegressor(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        random_state=RNG_SEED,
    )


def main() -> int:
    df = pd.read_parquet(FEATURES_PATH)
    print(f"loaded {len(df)} rows")

    train, val, test = recording_stratified_split(df, test_size=0.15, val_size=0.15)
    print(f"split: train={len(train)} val={len(val)} test={len(test)}")
    print("recording overlap (should all be 0):")
    print(f"  train∩test recordings: {len(set(train['recording_id']) & set(test['recording_id']))}")
    print(f"  train∩val recordings:  {len(set(train['recording_id']) & set(val['recording_id']))}")

    X_train = train[FEATURE_COLS].to_numpy()
    y_train = train[TARGET].to_numpy()
    g_train = train["recording_id"].to_numpy()

    X_val = val[FEATURE_COLS].to_numpy()
    y_val = val[TARGET].to_numpy()
    X_test = test[FEATURE_COLS].to_numpy()
    y_test = test[TARGET].to_numpy()

    models = {
        "ridge_poly2": make_ridge_poly,
        "mlp_64_32": make_mlp,
        "gbr_300_d4": make_gbr,
    }

    log = {"split": {"train": len(train), "val": len(val), "test": len(test)}, "models": {}}

    fitted = {}
    for name, factory in models.items():
        print(f"\n=== {name} ===")
        cv_mean, cv_std = cv_r2_on_train(factory, X_train, y_train, g_train, n_splits=5)
        print(f"  5-fold CV R² (recording-grouped): {cv_mean:.4f} ± {cv_std:.4f}")

        scaler = StandardScaler().fit(X_train)
        model = factory()
        model.fit(scaler.transform(X_train), y_train)

        val_pred = model.predict(scaler.transform(X_val))
        test_pred = model.predict(scaler.transform(X_test))
        val_m = metrics(y_val, val_pred)
        test_m = metrics(y_test, test_pred)
        print(f"  val:  r²={val_m['r2']:.4f} mae={val_m['mae']:.4f} sign={val_m['sign_accuracy']:.3f}")
        print(f"  test: r²={test_m['r2']:.4f} mae={test_m['mae']:.4f} sign={test_m['sign_accuracy']:.3f}")

        log["models"][name] = {
            "cv_r2_mean": cv_mean,
            "cv_r2_std": cv_std,
            "val": val_m,
            "test": test_m,
        }
        fitted[name] = (model, scaler)

    best_name = max(log["models"], key=lambda n: log["models"][n]["test"]["r2"])
    best_model, best_scaler = fitted[best_name]
    print(f"\nbest by test R²: {best_name}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": best_model,
            "scaler": best_scaler,
            "feature_names": FEATURE_COLS,
            "model_name": best_name,
        },
        MODELS_DIR / "pan_regressor.pkl",
    )

    test_with_pred = test.copy()
    test_with_pred["pred"] = best_model.predict(best_scaler.transform(X_test))
    test_with_pred.to_parquet(MODELS_DIR / "test_predictions.parquet", index=False)

    log["best_model"] = best_name
    log["feature_names"] = FEATURE_COLS
    with open(MODELS_DIR / "training_log.json", "w") as f:
        json.dump(log, f, indent=2)

    print(f"saved: {MODELS_DIR / 'pan_regressor.pkl'}")
    print(f"saved: {MODELS_DIR / 'test_predictions.parquet'}")
    print(f"saved: {MODELS_DIR / 'training_log.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
