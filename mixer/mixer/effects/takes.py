import numpy as np

from mixer.effects.eq import remove_subsonics
from mixer.effects.events import rms_db
from mixer.effects.looping import limit_peak, make_loopable

TAKE_MATCH_MAX_DB = 12.0


def match_take(wav: np.ndarray, sr: int, reference: np.ndarray) -> np.ndarray:
    if wav.ndim == 1:
        wav = wav[np.newaxis, :]
    take = make_loopable(remove_subsonics(np.asarray(wav, dtype=np.float64), sr), sr)
    offset_db = float(
        np.clip(rms_db(reference) - rms_db(take), -TAKE_MATCH_MAX_DB, TAKE_MATCH_MAX_DB)
    )
    return limit_peak(take * 10.0 ** (offset_db / 20.0))
