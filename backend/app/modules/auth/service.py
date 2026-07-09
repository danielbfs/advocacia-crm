"""Authentication business logic."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.modules.auth.models import User


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_all_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


_UNSET = object()


async def create_user(
    db: AsyncSession,
    username: str,
    full_name: str,
    password: str,
    role: str,
    must_change_password: bool = True,
    lawyer_id: uuid.UUID | None = None,
) -> User:
    user = User(
        username=username,
        full_name=full_name,
        password_hash=hash_password(password),
        role=role,
        must_change_password=must_change_password,
        lawyer_id=lawyer_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def change_password(db: AsyncSession, user: User, new_password: str) -> User:
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession,
    user: User,
    username: str | None = None,
    full_name: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    lawyer_id=_UNSET,
) -> User:
    if username is not None:
        user.username = username
    if full_name is not None:
        user.full_name = full_name
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active
    if lawyer_id is not _UNSET:
        user.lawyer_id = lawyer_id
    await db.commit()
    await db.refresh(user)
    return user
