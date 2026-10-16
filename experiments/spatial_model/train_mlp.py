import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score

df = pd.read_csv('data/spatial_dataset.csv')
print(f'Total samples: {len(df)}')
print(f'Stems: {df["stem"].value_counts().to_dict()}')
print(f'Pan range: {df["pan"].min():.3f} to {df["pan"].max():.3f}')
print(f'Pan std: {df["pan"].std():.3f}')

buckets = {'center(<0.1)': (df['pan'].abs()<0.1).sum(),
           'mid(0.1-0.4)': ((df['pan'].abs()>=0.1)&(df['pan'].abs()<0.4)).sum(),
           'wide(>0.4)': (df['pan'].abs()>=0.4).sum()}
for k,v in buckets.items():
    print(f'  {k}: {v} ({100*v/len(df):.1f}%)')

FEATURE_COLS = [
    'spectral_centroid', 'spectral_bandwidth', 'spectral_rolloff',
    'rms', 'zcr', 'onset_rate',
    *[f'mfcc_{i}' for i in range(13)]
]

X = df[FEATURE_COLS].values
y = df['pan'].values

print(f'\nFeatures: {X.shape[1]}, Samples: {X.shape[0]}')
assert not np.isnan(X).any(), 'NaN in features!'

tracks = df['track'].unique()
rng = np.random.default_rng(42)
rng.shuffle(tracks)
split = int(len(tracks) * 0.8)
train_tracks = set(tracks[:split])
test_tracks = set(tracks[split:])

train_mask = df['track'].isin(train_tracks)
test_mask = df['track'].isin(test_tracks)

X_train, y_train = X[train_mask], y[train_mask]
X_test, y_test = X[test_mask], y[test_mask]

print(f'Train: {len(X_train)} samples from {len(train_tracks)} tracks')
print(f'Test:  {len(X_test)} samples from {len(test_tracks)} tracks')

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

model = MLPRegressor(
    hidden_layer_sizes=(128, 64, 32),
    activation='relu',
    solver='adam',
    learning_rate_init=0.001,
    max_iter=1000,
    early_stopping=True,
    validation_fraction=0.1,
    n_iter_no_change=30,
    random_state=42,
    verbose=False
)

print('\nTraining...')
model.fit(X_train_scaled, y_train)
print(f'Converged after {model.n_iter_} iterations')

y_pred = model.predict(X_test_scaled)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)
baseline_mae = mean_absolute_error(y_test, np.full_like(y_test, y_train.mean()))

print(f'\nMAE:          {mae:.4f}  (pan units, range -1 to +1)')
print(f'R²:           {r2:.4f}')
print(f'Baseline MAE: {baseline_mae:.4f}  (predict mean — naive baseline)')
print(f'Improvement:  {(1 - mae/baseline_mae)*100:.1f}% over baseline')

for stem in ['drums', 'bass', 'other', 'vocals']:
    mask = df[df['track'].isin(test_tracks)]['stem'] == stem
    if mask.sum() == 0:
        continue
    stem_mae = mean_absolute_error(y_test[mask.values], y_pred[mask.values])
    print(f'  {stem:8s} MAE: {stem_mae:.4f}')

print('\nTop feature importances (MAE increase when permuted):')
rng2 = np.random.default_rng(0)
baseline = mean_absolute_error(y_test, model.predict(X_test_scaled))
importances = []
for i, feat in enumerate(FEATURE_COLS):
    X_perm = X_test_scaled.copy()
    rng2.shuffle(X_perm[:, i])
    perm_mae = mean_absolute_error(y_test, model.predict(X_perm))
    importances.append((feat, perm_mae - baseline))
importances.sort(key=lambda x: x[1], reverse=True)
for feat, imp in importances[:10]:
    print(f'  {feat:<25} {imp:.5f}')

out_dir = Path('mixer/models')
out_dir.mkdir(parents=True, exist_ok=True)

joblib.dump(model, out_dir / 'spatial_model.pkl')
joblib.dump(scaler, out_dir / 'spatial_scaler.pkl')

print(f'\nSaved: {out_dir}/spatial_model.pkl')
print(f'Saved: {out_dir}/spatial_scaler.pkl')

loaded_model = joblib.load(out_dir / 'spatial_model.pkl')
loaded_scaler = joblib.load(out_dir / 'spatial_scaler.pkl')
check = loaded_model.predict(loaded_scaler.transform(X_test_scaled[:5]))
print('\nReload check:')
for i in range(5):
    print(f'  predicted={check[i]:+.3f}  actual={y_test[i]:+.3f}')
