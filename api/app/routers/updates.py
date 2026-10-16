from fastapi import APIRouter, HTTPException, Request, status

from api.app.deps import CurrentAdmin, SessionDep
from api.app.models.schemas import Envelope, UpdateSettingsUpdate, UpdateStatusOut
from api.app.services.updates import (
    UpdateRunner,
    busy_reason,
    instance_settings,
    update_status,
    updater_ready,
)

router = APIRouter(prefix="/api/admin/updates", tags=["admin"])


def _runner(request: Request) -> UpdateRunner:
    return request.app.state.updater


@router.get("", response_model=Envelope[UpdateStatusOut])
def get_status(request: Request, session: SessionDep, _admin: CurrentAdmin):
    return Envelope(data=update_status(session, _runner(request)))


@router.post("/check", response_model=Envelope[UpdateStatusOut])
def check_now(request: Request, session: SessionDep, _admin: CurrentAdmin):
    return Envelope(data=update_status(session, _runner(request), force=True))


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=Envelope[UpdateStatusOut])
def start_update(request: Request, session: SessionDep, _admin: CurrentAdmin):
    reason = busy_reason(session)
    if reason:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)
    if not updater_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The updater is not running on this server.",
        )
    runner = _runner(request)
    if not runner.start() and not runner.updating:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The updater is not running on this server.",
        )
    return Envelope(data=update_status(session, runner))


@router.patch("", response_model=Envelope[UpdateStatusOut])
def update_settings(
    payload: UpdateSettingsUpdate,
    request: Request,
    session: SessionDep,
    _admin: CurrentAdmin,
):
    row = instance_settings(session)
    row.auto_update = payload.auto_update
    session.add(row)
    session.commit()
    return Envelope(data=update_status(session, _runner(request)))
