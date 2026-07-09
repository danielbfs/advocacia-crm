"""Authentication API endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.exceptions import UnauthorizedError
from app.core.permissions import get_current_user, require_role
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    revoke_refresh_token,
    verify_password,
)
from app.database import get_db
from app.modules.auth.models import User
from app.core.security import is_refresh_token_revoked
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    CreateUserRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    TokenResponse,
    UpdateUserRequest,
    UserResponse,
)
from app.modules.auth.service import (
    _UNSET,
    authenticate_user,
    change_password,
    create_user,
    get_all_users,
    get_user_by_id,
    get_user_by_username,
    update_user,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(db, body.username, body.password)
    if not user:
        raise UnauthorizedError()

    token_data = {"sub": str(user.id), "role": user.role}
    response = TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )
    await log_action(
        db,
        action="auth.login",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise UnauthorizedError()

    if await is_refresh_token_revoked(payload.get("jti", "")):
        raise UnauthorizedError()

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError()

    user = await get_user_by_id(db, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise UnauthorizedError()

    token_data = {"sub": str(user.id), "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/logout", status_code=204)
async def logout(
    body: LogoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Revoga o refresh token via blocklist no Redis."""
    payload = decode_token(body.refresh_token)
    if payload and payload.get("type") == "refresh":
        await revoke_refresh_token(payload)
        sub = payload.get("sub")
        user_id = uuid.UUID(sub) if sub else None
        await log_action(
            db,
            action="auth.logout",
            user_id=user_id,
            entity_type="user",
            entity_id=user_id,
            request=request,
        )
    # Sempre 204 — endpoint idempotente
    return None


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", response_model=MessageResponse)
async def change_my_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise UnauthorizedError()

    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="A nova senha deve ter no mínimo 6 caracteres.")

    await change_password(db, current_user, body.new_password)
    return MessageResponse(message="Senha alterada com sucesso.")


# --- Admin: gerenciamento de usuários ---

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    return await get_all_users(db)


@router.get("/users/assignable", response_model=list[UserResponse])
async def list_assignable_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista enxuta de usuários ativos para popular dropdowns de atribuição."""
    users = await get_all_users(db)
    return [u for u in users if u.is_active]


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_new_user(
    body: CreateUserRequest,
    request: Request,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in ("admin", "secretary", "lawyer"):
        raise HTTPException(status_code=422, detail="Role deve ser 'admin', 'secretary' ou 'lawyer'.")

    existing = await get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=409, detail="Usuário já cadastrado.")

    user = await create_user(
        db,
        username=body.username,
        full_name=body.full_name,
        password=body.password,
        role=body.role,
        lawyer_id=body.lawyer_id,
    )
    await log_action(
        db,
        action="user.create",
        user_id=current_user.id,
        entity_type="user",
        entity_id=user.id,
        payload={"username": user.username, "role": user.role},
        request=request,
    )
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_existing_user(
    user_id: uuid.UUID,
    body: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    if body.role is not None and body.role not in ("admin", "secretary", "lawyer"):
        raise HTTPException(status_code=422, detail="Role deve ser 'admin', 'secretary' ou 'lawyer'.")

    if body.username is not None:
        existing = await get_user_by_username(db, body.username)
        if existing and existing.id != user_id:
            raise HTTPException(status_code=409, detail="Usuário já cadastrado.")

    body_data = body.model_dump(exclude_unset=True)
    updated = await update_user(
        db, user,
        username=body.username,
        full_name=body.full_name,
        role=body.role,
        is_active=body.is_active,
        lawyer_id=body_data["lawyer_id"] if "lawyer_id" in body_data else _UNSET,
    )
    await log_action(
        db,
        action="user.update",
        user_id=current_user.id,
        entity_type="user",
        entity_id=updated.id,
        payload=body.model_dump(exclude_unset=True),
        request=request,
    )
    return updated


@router.post("/users/{user_id}/reset-password", response_model=MessageResponse)
async def admin_reset_password(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Admin reseta a senha de um usuário para o padrão do role."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    default_password = "admin" if user.role == "admin" else "advogado" if user.role == "lawyer" else "secretaria"
    await change_password(db, user, default_password)
    user.must_change_password = True
    await db.commit()

    await log_action(
        db,
        action="user.reset_password",
        user_id=current_user.id,
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    return MessageResponse(message="Senha resetada para o padrão. Usuário deverá alterar no próximo login.")
