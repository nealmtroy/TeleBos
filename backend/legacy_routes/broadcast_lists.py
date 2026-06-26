"""Broadcast list management routes — group lists and text lists."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.models.user import User
from app.schemas.broadcast import (
    GroupListCreate,
    GroupListResponse,
    GroupListUpdate,
    TextListCreate,
    TextListResponse,
    TextListUpdate,
)

router = APIRouter(prefix="/api/lists", tags=["broadcast_lists"])


# ── Group Lists ──────────────────────────────────────────────────────


@router.get("/groups", response_model=list[GroupListResponse])
async def list_group_lists(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GroupList).where(GroupList.user_id == user.id).order_by(GroupList.created_at.desc())
    )
    return result.scalars().all()


@router.post("/groups", response_model=GroupListResponse, status_code=201)
async def create_group_list(body: GroupListCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    glist = GroupList(user_id=user.id, name=body.name, items=body.items)
    db.add(glist)
    await db.flush()
    return glist


@router.put("/groups/{list_id}", response_model=GroupListResponse)
async def update_group_list(list_id: str, body: GroupListUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GroupList).where(GroupList.id == list_id, GroupList.user_id == user.id)
    )
    glist = result.scalar_one_or_none()
    if not glist:
        raise HTTPException(status_code=404, detail="Group list not found")
    if body.name is not None:
        glist.name = body.name
    if body.items is not None:
        glist.items = body.items
    await db.flush()
    return glist


@router.delete("/groups/{list_id}", status_code=204)
async def delete_group_list(list_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GroupList).where(GroupList.id == list_id, GroupList.user_id == user.id)
    )
    glist = result.scalar_one_or_none()
    if not glist:
        raise HTTPException(status_code=404, detail="Group list not found")
    await db.delete(glist)


@router.put("/groups/{list_id}/items", response_model=GroupListResponse)
async def update_group_items(
    list_id: str,
    body: GroupListUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add or remove items from a group list."""
    result = await db.execute(
        select(GroupList).where(GroupList.id == list_id, GroupList.user_id == user.id)
    )
    glist = result.scalar_one_or_none()
    if not glist:
        raise HTTPException(status_code=404, detail="Group list not found")
    if body.items is not None:
        glist.items = body.items
    await db.flush()
    return glist


# ── Text Lists ───────────────────────────────────────────────────────


@router.get("/texts", response_model=list[TextListResponse])
async def list_text_lists(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TextList).where(TextList.user_id == user.id).order_by(TextList.created_at.desc())
    )
    return result.scalars().all()


@router.post("/texts", response_model=TextListResponse, status_code=201)
async def create_text_list(body: TextListCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    tlist = TextList(user_id=user.id, name=body.name, texts=body.texts)
    db.add(tlist)
    await db.flush()
    return tlist


@router.put("/texts/{list_id}", response_model=TextListResponse)
async def update_text_list(list_id: str, body: TextListUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TextList).where(TextList.id == list_id, TextList.user_id == user.id)
    )
    tlist = result.scalar_one_or_none()
    if not tlist:
        raise HTTPException(status_code=404, detail="Text list not found")
    if body.name is not None:
        tlist.name = body.name
    if body.texts is not None:
        tlist.texts = body.texts
    await db.flush()
    return tlist


@router.delete("/texts/{list_id}", status_code=204)
async def delete_text_list(list_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TextList).where(TextList.id == list_id, TextList.user_id == user.id)
    )
    tlist = result.scalar_one_or_none()
    if not tlist:
        raise HTTPException(status_code=404, detail="Text list not found")
    await db.delete(tlist)


@router.put("/texts/{list_id}/items", response_model=TextListResponse)
async def update_text_items(
    list_id: str,
    body: TextListUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add or remove text items."""
    result = await db.execute(
        select(TextList).where(TextList.id == list_id, TextList.user_id == user.id)
    )
    tlist = result.scalar_one_or_none()
    if not tlist:
        raise HTTPException(status_code=404, detail="Text list not found")
    if body.texts is not None:
        tlist.texts = body.texts
    await db.flush()
    return tlist
